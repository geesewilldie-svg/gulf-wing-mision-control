import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { stageRuntimeBlob } from "../lib/server/runtime-blob";
import { readHubArchive } from "../lib/server/hub-archive-history";
import { askProvider } from "../lib/server/agent-router";
import { fixtureRole } from "./helpers/access";
const u64 = (n: number) => {
    const b = Buffer.alloc(8);
    b.writeBigUInt64LE(BigInt(n));
    return b;
  },
  u32 = (n: number) => {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(n);
    return b;
  },
  str = (s: string) =>
    Buffer.concat([u64(Buffer.byteLength(s)), Buffer.from(s)]);
const bytes = Buffer.concat([
    Buffer.from("GGUF"),
    u32(3),
    u64(0),
    u64(1),
    str("general.architecture"),
    u32(8),
    str("llama"),
    Buffer.from("fixture weights"),
  ]),
  sha = createHash("sha256").update(bytes).digest("hex"),
  model = "fixture:latest",
  signal = () => new AbortController().signal;
async function archive(root: string, slot = "asset-000") {
  const dir = path.join(root, "model-assets", slot);
  await fs.mkdir(dir, { recursive: true });
  const receipt = {
      version: 1,
      kind: "hub-model-archive",
      runId: randomUUID(),
      state: "verified",
      startedAt: "2026-11-27T00:00:00.000Z",
      verifiedAt: "2026-11-27T00:00:01.000Z",
      repository: "owner/model",
      revision: "a".repeat(40),
      sourceFilename: "model.gguf",
      reportedLicense: "apache-2.0",
      expectedBytes: bytes.length,
      expectedSha256: sha,
      archiveFile: slot + "/model.gguf",
      licenseReviewed: true,
      archiveOnly: true,
      runtimeImported: false,
      inferenceReady: false,
      bytes: bytes.length,
      sha256: sha,
      receiptState: "saved",
      downloaded: true,
    },
    raw = JSON.stringify(receipt),
    digest = createHash("sha256").update(raw).digest("hex");
  await fs.writeFile(path.join(dir, "model.gguf"), bytes);
  await fs.writeFile(path.join(dir, "receipt.json"), raw);
  return {
    dir,
    receipt,
    raw,
    digest,
    input: {
      action: "stage-runtime-blob",
      slot,
      receiptSha256: digest,
      expectedLicense: "apache-2.0",
      licenseReviewed: true,
      stageOnly: true,
    },
  };
}
async function store(root: string) {
  const file = path.join(root, "blobs", "sha256-" + "b".repeat(64));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, "old fixture blob");
  return file;
}
async function fixture(
  run: (
    f: Awaited<ReturnType<typeof archive>>,
    root: string,
    calls: string[],
  ) => Promise<void>,
  existing = false,
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-stage-")),
    prior = process.env.GW_SYNC_DATA_DIR,
    models = process.env.OLLAMA_MODELS,
    selected = process.env.GW_NEXUS_MODEL,
    transport = global.fetch;
  process.env.GW_SYNC_DATA_DIR = root;
  process.env.OLLAMA_MODELS = path.join(root, "store");
  process.env.GW_NEXUS_MODEL = "fixture";
  const old = await store(process.env.OLLAMA_MODELS),
    f = await archive(root),
    calls: string[] = [];
  let present = existing;
  global.fetch = async (url, options) => {
    const target = String(url),
      method = options?.method || "GET";
    calls.push(`${method} ${target}`);
    expect(options?.redirect).toBe("error");
    if (target.endsWith("/api/tags"))
      return Response.json({
        models: [
          {
            name: model,
            digest: "a".repeat(64),
            size: 10,
            modified_at: "2026-11-27T00:00:00Z",
          },
        ],
      });
    if (target.endsWith("/api/show"))
      return Response.json({ modelfile: `FROM ${old}` });
    expect(target).toBe(`http://127.0.0.1:11434/api/blobs/sha256:${sha}`);
    expect(options?.credentials).toBe("omit");
    if (method === "HEAD")
      return new Response(null, { status: present ? 200 : 404 });
    expect(method).toBe("POST");
    expect(options?.headers).toMatchObject({
      "Content-Length": String(bytes.length),
    });
    const reader = (options?.body as ReadableStream).getReader(),
      chunks: Buffer[] = [];
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      chunks.push(Buffer.from(r.value));
    }
    expect(Buffer.concat(chunks)).toEqual(bytes);
    present = true;
    return new Response(null, { status: 201 });
  };
  try {
    await run(f, root, calls);
  } finally {
    global.fetch = transport;
    if (prior === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = prior;
    if (models === undefined) delete process.env.OLLAMA_MODELS;
    else process.env.OLLAMA_MODELS = models;
    if (selected === undefined) delete process.env.GW_NEXUS_MODEL;
    else process.env.GW_NEXUS_MODEL = selected;
    await fs.rm(root, { recursive: true, force: true });
  }
}
test("verified source stages one content-addressed blob, preserves originals and retains a separate receipt", () =>
  fixture(async (f, _root, calls) => {
    const before = await fs.stat(path.join(f.dir, "model.gguf"));
    const result = await stageRuntimeBlob(f.input, signal());
    expect(result).toMatchObject({
      state: "staged",
      sha256: sha,
      bytes: bytes.length,
      reusedExisting: false,
      runtimeImported: false,
      inferenceReady: false,
    });
    expect(
      calls.filter((x) => x.startsWith("POST ") && x.includes("/blobs/")),
    ).toHaveLength(1);
    expect(
      calls.some((x) => /api\/(create|generate|pull|delete)/.test(x)),
    ).toBe(false);
    expect(await fs.readFile(path.join(f.dir, "model.gguf"))).toEqual(bytes);
    expect(await fs.readFile(path.join(f.dir, "receipt.json"), "utf8")).toBe(
      f.raw,
    );
    expect((await fs.stat(path.join(f.dir, "model.gguf"))).mtimeMs).toBe(
      before.mtimeMs,
    );
    const count = calls.length;
    const history = await readHubArchive(signal());
    expect(history.records[0].runtimeBlob).toMatchObject({
      state: "recorded",
      receipt: { state: "staged" },
    });
    expect(calls.length).toBe(count);
    await expect(stageRuntimeBlob(f.input, signal())).rejects.toThrow(
      /receipt already exists/,
    );
    expect(
      calls.filter((x) => x.startsWith("POST ") && x.includes("/blobs/")),
    ).toHaveLength(1);
  }));
test("existing runtime blob is acknowledged without uploading or creating a model", () =>
  fixture(async (f, _root, calls) => {
    expect((await stageRuntimeBlob(f.input, signal())).reusedExisting).toBe(
      true,
    );
    expect(
      calls.filter((x) => x.startsWith("POST ") && x.includes("/blobs/")),
    ).toHaveLength(0);
  }, true));
test("bad intent/license, source mismatch or unknown storage prevent upload and receipt creation", () =>
  fixture(async (f, _root, calls) => {
    for (const input of [
      { ...f.input, stageOnly: false },
      { ...f.input, path: "/private" },
      { ...f.input, licenseReviewed: false },
    ])
      await expect(stageRuntimeBlob(input, signal())).rejects.toThrow();
    expect(calls).toHaveLength(0);
    await expect(
      stageRuntimeBlob({ ...f.input, expectedLicense: "mit" }, signal()),
    ).rejects.toThrow(/license changed/);
    expect(calls).toHaveLength(0);
    const original = global.fetch;
    global.fetch = async () => Response.json({ models: [] });
    await expect(stageRuntimeBlob(f.input, signal())).rejects.toThrow(
      /storage/,
    );
    global.fetch = original;
    expect(await fs.readdir(f.dir)).toEqual(["model.gguf", "receipt.json"]);
    const tampered = Buffer.from(bytes);
    tampered[tampered.length - 1] ^= 1;
    await fs.writeFile(path.join(f.dir, "model.gguf"), tampered);
    await expect(stageRuntimeBlob(f.input, signal())).rejects.toThrow(
      /does not match/,
    );
    expect(calls).toHaveLength(0);
  }));
test("early/failed runtime acknowledgments retain uncertainty and never retry", () =>
  fixture(async (f, _root, calls) => {
    const original = global.fetch;
    global.fetch = async (url, options) =>
      String(url).includes("/blobs/") && options?.method === "POST"
        ? new Response(null, { status: 201 })
        : original(url, options);
    await expect(stageRuntimeBlob(f.input, signal())).rejects.toThrow(
      /not confirmed/,
    );
    const receipt = JSON.parse(
      await fs.readFile(path.join(f.dir, "runtime-blob-stage.json"), "utf8"),
    );
    expect(receipt.state).toBe("unconfirmed");
    expect(await fs.readFile(path.join(f.dir, "receipt.json"), "utf8")).toBe(
      f.raw,
    );
    expect(calls.some((x) => x.includes("/create"))).toBe(false);
  }));
test("source replacement after upload cannot become a confirmed staging outcome", () =>
  fixture(async (f) => {
    const original = global.fetch;
    let uploaded = false;
    global.fetch = async (url, options) => {
      const r = await original(url, options);
      if (String(url).includes("/blobs/") && options?.method === "POST")
        uploaded = true;
      else if (uploaded && options?.method === "HEAD") {
        await fs.unlink(path.join(f.dir, "model.gguf"));
        await fs.writeFile(path.join(f.dir, "model.gguf"), bytes);
      }
      return r;
    };
    await expect(stageRuntimeBlob(f.input, signal())).rejects.toThrow(
      /not confirmed/,
    );
    expect(
      JSON.parse(
        await fs.readFile(path.join(f.dir, "runtime-blob-stage.json"), "utf8"),
      ).state,
    ).toBe("unconfirmed");
  }));
test("cancelled uploads retain uncertainty and release shared inference admission without cleanup or retry", () =>
  fixture(async (f) => {
    const original = global.fetch;
    let reached!: () => void;
    const entered = new Promise<void>((resolve) => (reached = resolve));
    global.fetch = async (url, options) => {
      if (!String(url).includes("/blobs/") || options?.method !== "POST")
        return original(url, options);
      reached();
      return new Promise((_resolve, reject) =>
        options.signal?.addEventListener(
          "abort",
          () => reject(Error("cancelled")),
          { once: true },
        ),
      );
    };
    const c = new AbortController(),
      pending = stageRuntimeBlob(f.input, c.signal),
      rejected = expect(pending).rejects.toThrow(/not confirmed/);
    await entered;
    await expect(
      askProvider("local", "private", "private", [], signal()),
    ).rejects.toThrow(/busy/);
    c.abort();
    await rejected;
    expect(
      JSON.parse(
        await fs.readFile(path.join(f.dir, "runtime-blob-stage.json"), "utf8"),
      ).state,
    ).toBe("unconfirmed");
    global.fetch = original;
    await expect(stageRuntimeBlob(f.input, signal())).rejects.toThrow(
      /receipt already exists/,
    );
  }));
test("stage API requires controller/origin and exact stage-only intent", async ({
  context,
}) => {
  const body = {
    action: "stage-runtime-blob",
    slot: "asset-000",
    receiptSha256: "c".repeat(64),
    expectedLicense: "apache-2.0",
    licenseReviewed: true,
    stageOnly: true,
  };
  expect(
    (
      await context.request.post("/api/sync/models/hub/archive", { data: body })
    ).status(),
  ).toBe(401);
  await fixtureRole(context, "display");
  expect(
    (
      await context.request.post("/api/sync/models/hub/archive", { data: body })
    ).status(),
  ).toBe(403);
  await fixtureRole(context);
  expect(
    (
      await context.request.post("/api/sync/models/hub/archive", {
        data: body,
        headers: { Origin: "https://foreign.invalid" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await context.request.post("/api/sync/models/hub/archive", {
        data: { ...body, model: "replace-me" },
      })
    ).status(),
  ).toBe(400);
});
test("compiled API streams a real disposable archive into an owned runtime fixture without model creation", async ({
  context,
}) => {
  const root = process.env.GW_SYNC_TEST_ROOT!,
    f = await archive(root, "asset-099"),
    storeRoot = path.join(root, "ollama-models"),
    old = await store(storeRoot),
    destination = path.join(storeRoot, "blobs", "sha256-" + sha),
    { createServer } = await import("node:http");
  const calls: string[] = [];
  const server = createServer(async (req, res) => {
    calls.push(`${req.method} ${req.url}`);
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/tags") {
      res.end(
        JSON.stringify({
          models: [
            {
              name: model,
              digest: "a".repeat(64),
              size: 10,
              modified_at: "2026-11-27T00:00:00Z",
            },
          ],
        }),
      );
      return;
    }
    if (req.url === "/api/show") {
      for await (const _chunk of req) {
      }
      res.end(JSON.stringify({ modelfile: `FROM ${old}` }));
      return;
    }
    if (req.url === `/api/blobs/sha256:${sha}` && req.method === "HEAD") {
      try {
        await fs.stat(destination);
        res.statusCode = 200;
      } catch {
        res.statusCode = 404;
      }
      res.end();
      return;
    }
    if (req.url === `/api/blobs/sha256:${sha}` && req.method === "POST") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const received = Buffer.concat(chunks);
      if (!received.equals(bytes)) {
        res.statusCode = 400;
        res.end();
        return;
      }
      await fs.writeFile(destination, received, { flag: "wx" });
      res.statusCode = 201;
      res.end();
      return;
    }
    res.statusCode = 400;
    res.end();
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(11434, "127.0.0.1", resolve);
  });
  try {
    await fixtureRole(context);
    const response = await context.request.post(
      "/api/sync/models/hub/archive",
      { data: f.input },
    );
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      state: "staged",
      runtimeImported: false,
    });
    expect(await fs.readFile(destination)).toEqual(bytes);
    expect(await fs.readFile(path.join(f.dir, "model.gguf"))).toEqual(bytes);
    expect(calls.filter((x) => x.startsWith("POST /api/blobs"))).toHaveLength(
      1,
    );
    expect(calls.some((x) => /\/api\/(create|generate|pull)/.test(x))).toBe(
      false,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await fs.rm(f.dir, { recursive: true, force: true });
    await fs.rm(storeRoot, { recursive: true, force: true });
  }
});

test("recorded stage history projects known fields and withholds unsafe metadata", () =>
  fixture(async (f) => {
    await stageRuntimeBlob(f.input, signal());
    const file = path.join(f.dir, "runtime-blob-stage.json"),
      raw = JSON.parse(await fs.readFile(file, "utf8"));
    await fs.writeFile(
      file,
      JSON.stringify({ ...raw, privatePath: "PRIVATE PATH" }),
    );
    expect(
      JSON.stringify((await readHubArchive(signal())).records[0].runtimeBlob),
    ).not.toContain("PRIVATE");
    await fs.unlink(file);
    await fs.symlink(path.join(f.dir, "receipt.json"), file);
    expect((await readHubArchive(signal())).records[0].runtimeBlob).toEqual({
      state: "unavailable",
    });
  }, true));
test("desktop and phone require source/license confirmation before one explicit staging action", async ({
  page,
  context,
}, info) => {
  await fixtureRole(context);
  let stages = 0;
  const record = {
    slot: "asset-000",
    runId: randomUUID(),
    state: "verified",
    repository: "owner/model",
    revision: "a".repeat(40),
    sourceFilename: "model.gguf",
    reportedLicense: "apache-2.0",
    recordedBytes: bytes.length,
    recordedSha256: sha,
    recordedAt: new Date().toISOString(),
    fileState: "size-matches-record",
    fileBytes: bytes.length,
    partialPresent: false,
    receiptSha256: "c".repeat(64),
    runtimeBlob: { state: "not-recorded" },
  };
  const review = {
    slot: record.slot,
    runId: record.runId,
    receiptSha256: record.receiptSha256,
    bytes: bytes.length,
    sha256: sha,
    hashCheckedAt: new Date().toISOString(),
    metadata: { architecture: "llama", contextLength: 4096 },
    runtime: { state: "version-reported", version: "0.9.0" },
    hostMemory: { totalBytes: 8 * 1024 ** 3, freeBytes: 4 * 1024 ** 3 },
    recordedLicense: "apache-2.0",
    blockers: ["Model creation remains a separate step."],
    importImplemented: true,
  };
  await page.route("**/api/sync/models/hub/archive", (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "list")
      return route.fulfill({
        json: {
          state: "available",
          records: [record],
          validRecords: 1,
          withheldRecords: 0,
          occupiedSlots: 1,
          capacity: 100,
          pageLimit: 20,
          readAt: new Date().toISOString(),
          notice: "Archive records",
        },
      });
    if (body.action === "import-review") return route.fulfill({ json: review });
    if (body.action === "import-storage-review")
      return route.fulfill({
        json: {
          ...review,
          runtimeStorage: {
            state: "observed",
            source: "server-user-default",
            reportedModel: model,
            availableBytes: 20 * 1024 ** 3,
            requiredBytes: 1024 ** 3 + bytes.length * 2,
            capacity: "enough-at-check",
            checkedAt: new Date().toISOString(),
          },
        },
      });
    stages++;
    expect(body).toEqual({
      action: "stage-runtime-blob",
      slot: record.slot,
      receiptSha256: record.receiptSha256,
      expectedLicense: record.reportedLicense,
      licenseReviewed: true,
      stageOnly: true,
    });
    return route.fulfill({
      json: {
        version: 1,
        kind: "runtime-blob-stage",
        runId: randomUUID(),
        slot: record.slot,
        receiptSha256: record.receiptSha256,
        sha256: sha,
        bytes: bytes.length,
        state: "staged",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        reusedExisting: false,
        runtimeImported: false,
        inferenceReady: false,
      },
    });
  });
  await page.goto("/nexus");
  await page
    .getByRole("navigation", { name: "Nexus sections" })
    .getByRole("button", { name: "Connections", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Models and tools", exact: true })
    .click();
  await page.getByText("Local model archive", { exact: true }).click();
  await page
    .getByRole("button", { name: "Inspect local model archive", exact: true })
    .click();
  const parent = page.getByRole("region", {
    name: "Import review asset-000",
    exact: true,
  });
  await parent
    .getByRole("button", {
      name: "Review runtime import · asset-000",
      exact: true,
    })
    .click();
  await parent
    .getByRole("button", {
      name: "Inspect Ollama storage · asset-000",
      exact: true,
    })
    .click();
  const panel = parent.getByRole("region", {
      name: "Runtime blob staging asset-000",
      exact: true,
    }),
    button = panel.getByRole("button", {
      name: "Stage weights in Ollama · asset-000",
      exact: true,
    });
  expect(stages).toBe(0);
  await expect(button).toBeDisabled();
  expect(
    await panel
      .locator("label.business-check")
      .evaluate((el) => getComputedStyle(el).flexDirection),
  ).toBe("row");
  await panel.getByRole("checkbox").check();
  await button.click();
  await expect(
    panel.getByText("Runtime acknowledges blob presence", { exact: true }),
  ).toBeVisible();
  await expect(button).toBeDisabled();
  expect(stages).toBe(1);
  await panel.scrollIntoViewIfNeeded();
  await fs.mkdir("artifacts/runtime-blob", { recursive: true });
  await panel.screenshot({
    path: `artifacts/runtime-blob/${info.project.name}.png`,
  });
  expect(
    await panel.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
});
