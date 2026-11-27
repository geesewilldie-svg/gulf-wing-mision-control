import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createRuntimeModel } from "../lib/server/runtime-model-create";
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
    u64(1),
    u64(1),
    str("general.architecture"),
    u32(8),
    str("llama"),
    Buffer.from("fixture tensor bytes"),
  ]),
  sha = createHash("sha256").update(bytes).digest("hex"),
  model = "fixture:latest",
  manifestDigest = "c".repeat(64),
  signal = () => new AbortController().signal;
async function archive(root: string, slot = "asset-000") {
  const dir = path.join(root, "model-assets", slot);
  await fs.mkdir(dir, { recursive: true });
  const source = {
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
    raw = JSON.stringify(source),
    receiptSha256 = createHash("sha256").update(raw).digest("hex"),
    stage = {
      version: 1,
      kind: "runtime-blob-stage",
      runId: randomUUID(),
      slot,
      receiptSha256,
      sha256: sha,
      bytes: bytes.length,
      state: "unconfirmed",
      startedAt: "2026-11-27T00:00:02.000Z",
      finishedAt: "2026-11-27T00:00:03.000Z",
      runtimeImported: false,
      inferenceReady: false,
    };
  await fs.writeFile(path.join(dir, "model.gguf"), bytes);
  await fs.writeFile(path.join(dir, "receipt.json"), raw);
  await fs.writeFile(
    path.join(dir, "runtime-blob-stage.json"),
    JSON.stringify(stage),
  );
  return {
    dir,
    source,
    stage,
    input: {
      action: "create-runtime-model",
      slot,
      receiptSha256,
      stageRunId: stage.runId,
      expectedLicense: "apache-2.0",
      licenseReviewed: true,
      createOnly: true,
    },
  };
}
async function store(root: string) {
  const old = path.join(root, "blobs", "sha256-" + "b".repeat(64));
  await fs.mkdir(path.dirname(old), { recursive: true });
  await fs.writeFile(old, "old fixture blob");
  return old;
}
async function fixture(
  run: (
    f: Awaited<ReturnType<typeof archive>>,
    calls: string[],
    created: () => string | null,
  ) => Promise<void>,
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-create-")),
    prior = process.env.GW_SYNC_DATA_DIR,
    models = process.env.OLLAMA_MODELS,
    selected = process.env.GW_NEXUS_MODEL,
    transport = global.fetch,
    free = os.freemem;
  process.env.GW_SYNC_DATA_DIR = root;
  process.env.OLLAMA_MODELS = path.join(root, "store");
  process.env.GW_NEXUS_MODEL = "fixture";
  const old = await store(process.env.OLLAMA_MODELS),
    f = await archive(root),
    calls: string[] = [];
  let alias: string | null = null;
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
          ...(alias
            ? [
                {
                  name: alias,
                  digest: manifestDigest,
                  size: bytes.length,
                  modified_at: "2026-11-27T00:00:04Z",
                },
              ]
            : []),
        ],
      });
    if (target.endsWith("/api/show")) {
      const body = JSON.parse(String(options?.body));
      expect(body.verbose).toBe(false);
      if (body.model === model)
        return Response.json({
          modelfile: `FROM ${old}`,
          system: "PRIVATE SYSTEM",
        });
      expect(body.model).toMatch(/^nexus-archive-[a-f0-9-]{36}:latest$/);
      return body.model === alias
        ? Response.json({
            details: { format: "gguf" },
            model_info: { "general.architecture": "llama" },
            system: "PRIVATE SYSTEM",
          })
        : new Response(null, { status: 404 });
    }
    if (target.includes("/api/blobs/")) {
      expect(method).toBe("HEAD");
      expect(target).toBe(`http://127.0.0.1:11434/api/blobs/sha256:${sha}`);
      return new Response(null, { status: 200 });
    }
    expect(target).toBe("http://127.0.0.1:11434/api/create");
    expect(method).toBe("POST");
    expect(options?.credentials).toBe("omit");
    const body = JSON.parse(String(options?.body));
    expect(body).toEqual({
      model: expect.stringMatching(/^nexus-archive-[a-f0-9-]{36}:latest$/),
      files: { "model.gguf": `sha256:${sha}` },
      stream: false,
    });
    alias = body.model;
    return Response.json({ status: "success" });
  };
  try {
    await run(f, calls, () => alias);
  } finally {
    global.fetch = transport;
    os.freemem = free;
    if (prior === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = prior;
    if (models === undefined) delete process.env.OLLAMA_MODELS;
    else process.env.OLLAMA_MODELS = models;
    if (selected === undefined) delete process.env.GW_NEXUS_MODEL;
    else process.env.GW_NEXUS_MODEL = selected;
    await fs.rm(root, { recursive: true, force: true });
  }
}
test("creation uses a fresh alias and local blob only, preserves originals/default and records runtime metadata", () =>
  fixture(async (f, calls, created) => {
    const originals = await Promise.all(
      ["model.gguf", "receipt.json", "runtime-blob-stage.json"].map(
        async (name) => ({
          name,
          bytes: await fs.readFile(path.join(f.dir, name)),
          mtime: (await fs.stat(path.join(f.dir, name))).mtimeMs,
        }),
      ),
    );
    const result = await createRuntimeModel(f.input, signal());
    expect(result).toMatchObject({
      state: "created",
      alias: created(),
      manifestDigest,
      architecture: "llama",
      runtimeImported: true,
      inferenceReady: false,
    });
    expect(result.alias).toBe(`nexus-archive-${result.runId}:latest`);
    expect(calls.filter((x) => x.endsWith("/api/create"))).toHaveLength(1);
    expect(
      calls.some((x) => /\/api\/(generate|chat|pull|delete)/.test(x)),
    ).toBe(false);
    expect(process.env.GW_NEXUS_MODEL).toBe("fixture");
    for (const original of originals) {
      expect(await fs.readFile(path.join(f.dir, original.name))).toEqual(
        original.bytes,
      );
      expect((await fs.stat(path.join(f.dir, original.name))).mtimeMs).toBe(
        original.mtime,
      );
    }
    const count = calls.length;
    const history = await readHubArchive(signal());
    expect(history.records[0].runtimeModel).toMatchObject({
      state: "recorded",
      receipt: { state: "created", alias: result.alias },
    });
    expect(calls.length).toBe(count);
    await expect(createRuntimeModel(f.input, signal())).rejects.toThrow(
      /receipt already exists/,
    );
    expect(calls.filter((x) => x.endsWith("/api/create"))).toHaveLength(1);
  }));
test("intent, license, run/source identity and free-RAM gates prevent creation", () =>
  fixture(async (f, calls) => {
    for (const input of [
      { ...f.input, createOnly: false },
      { ...f.input, model: "existing" },
      { ...f.input, licenseReviewed: false },
      { ...f.input, stageRunId: randomUUID() },
      { ...f.input, receiptSha256: "d".repeat(64) },
      { ...f.input, expectedLicense: "mit" },
    ])
      await expect(createRuntimeModel(input, signal())).rejects.toThrow();
    expect(calls).toHaveLength(0);
    os.freemem = () => 0;
    await expect(createRuntimeModel(f.input, signal())).rejects.toThrow(
      /free-RAM/,
    );
    expect(calls).toHaveLength(0);
    expect(await fs.readdir(f.dir)).toEqual([
      "model.gguf",
      "receipt.json",
      "runtime-blob-stage.json",
    ]);
  }));
test("missing blob and an existing nonce name cannot issue create calls", () =>
  fixture(async (f, calls) => {
    const original = global.fetch;
    global.fetch = async (url, options) =>
      String(url).includes("/api/blobs/")
        ? new Response(null, { status: 404 })
        : original(url, options);
    await expect(createRuntimeModel(f.input, signal())).rejects.toThrow(
      /required blob/,
    );
    global.fetch = async (url, options) => {
      if (
        String(url).endsWith("/api/show") &&
        JSON.parse(String(options?.body)).model !== model
      )
        return Response.json({ details: { format: "gguf" } });
      return original(url, options);
    };
    await expect(createRuntimeModel(f.input, signal())).rejects.toThrow(
      /name was not confirmed absent/,
    );
    expect(calls.some((x) => x.endsWith("/api/create"))).toBe(false);
    expect(await fs.readdir(f.dir)).toEqual([
      "model.gguf",
      "receipt.json",
      "runtime-blob-stage.json",
    ]);
  }));
test("wrong post-create metadata retains uncertainty without deletion or another create", () =>
  fixture(async (f, calls) => {
    const original = global.fetch;
    let didCreate = false;
    global.fetch = async (url, options) => {
      const result = await original(url, options);
      if (String(url).endsWith("/api/create")) didCreate = true;
      else if (didCreate && String(url).endsWith("/api/show"))
        return Response.json({
          details: { format: "gguf" },
          model_info: { "general.architecture": "other" },
        });
      return result;
    };
    await expect(createRuntimeModel(f.input, signal())).rejects.toThrow(
      /not confirmed/,
    );
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(f.dir, "runtime-model-create.json"),
          "utf8",
        ),
      ).state,
    ).toBe("unconfirmed");
    expect(calls.filter((x) => x.endsWith("/api/create"))).toHaveLength(1);
    expect(calls.some((x) => /delete|generate/.test(x))).toBe(false);
  }));
test("selected-default changes after create never yield accepted success", () =>
  fixture(async (f) => {
    const original = global.fetch;
    global.fetch = async (url, options) => {
      const result = await original(url, options);
      if (String(url).endsWith("/api/create"))
        process.env.GW_NEXUS_MODEL = "changed";
      return result;
    };
    await expect(createRuntimeModel(f.input, signal())).rejects.toThrow(
      /not confirmed/,
    );
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(f.dir, "runtime-model-create.json"),
          "utf8",
        ),
      ).state,
    ).toBe("unconfirmed");
    expect(
      JSON.parse(
        await fs.readFile(path.join(f.dir, "runtime-blob-stage.json"), "utf8"),
      ).state,
    ).toBe("unconfirmed");
  }));
test("cancellation during creation retains the generated name and releases shared admission without retry", () =>
  fixture(async (f, calls) => {
    const original = global.fetch;
    let reached!: () => void;
    const entered = new Promise<void>((resolve) => (reached = resolve));
    global.fetch = async (url, options) => {
      if (!String(url).endsWith("/api/create")) return original(url, options);
      reached();
      return new Promise((_resolve, reject) =>
        options?.signal?.addEventListener(
          "abort",
          () => reject(Error("cancelled")),
          { once: true },
        ),
      );
    };
    const c = new AbortController(),
      pending = createRuntimeModel(f.input, c.signal),
      rejected = expect(pending).rejects.toThrow(/not confirmed/);
    await entered;
    await expect(
      askProvider("local", "private", "private", [], signal()),
    ).rejects.toThrow(/busy/);
    c.abort();
    await rejected;
    const receipt = JSON.parse(
      await fs.readFile(path.join(f.dir, "runtime-model-create.json"), "utf8"),
    );
    expect(receipt.state).toBe("unconfirmed");
    expect(receipt.alias).toMatch(/^nexus-archive-/);
    global.fetch = original;
    await expect(createRuntimeModel(f.input, signal())).rejects.toThrow(
      /receipt already exists/,
    );
    expect(calls.filter((x) => x.endsWith("/api/create"))).toHaveLength(0);
  }));
test("creation receipt inspection withholds malformed/symlinked records and projects known fields only", () =>
  fixture(async (f) => {
    await createRuntimeModel(f.input, signal());
    const file = path.join(f.dir, "runtime-model-create.json"),
      raw = JSON.parse(await fs.readFile(file, "utf8"));
    await fs.writeFile(
      file,
      JSON.stringify({ ...raw, privatePath: "PRIVATE PATH" }),
    );
    expect(
      JSON.stringify((await readHubArchive(signal())).records[0].runtimeModel),
    ).not.toContain("PRIVATE");
    await fs.writeFile(
      file,
      JSON.stringify({ ...raw, alias: "existing:latest" }),
    );
    expect((await readHubArchive(signal())).records[0].runtimeModel).toEqual({
      state: "unavailable",
    });
    await fs.unlink(file);
    await fs.symlink(path.join(f.dir, "receipt.json"), file);
    expect((await readHubArchive(signal())).records[0].runtimeModel).toEqual({
      state: "unavailable",
    });
  }));
test("compiled creation API enforces controller/origin/exact fields before effects", async ({
  context,
}) => {
  const body = {
    action: "create-runtime-model",
    slot: "asset-000",
    receiptSha256: "a".repeat(64),
    stageRunId: randomUUID(),
    expectedLicense: "apache-2.0",
    licenseReviewed: true,
    createOnly: true,
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
        data: { ...body, model: "replace" },
      })
    ).status(),
  ).toBe(400);
});
test("compiled API creates exactly one fresh runtime alias through an owned HTTP fixture", async ({
  context,
}) => {
  const root = process.env.GW_SYNC_TEST_ROOT!,
    f = await archive(root, "asset-099"),
    storeRoot = path.join(root, "ollama-models"),
    old = await store(storeRoot),
    { createServer } = await import("node:http");
  let alias: string | null = null;
  const calls: string[] = [];
  const server = createServer(async (req, res) => {
    calls.push(`${req.method} ${req.url}`);
    let raw = "";
    for await (const chunk of req) raw += chunk.toString();
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
            ...(alias
              ? [
                  {
                    name: alias,
                    digest: manifestDigest,
                    size: bytes.length,
                    modified_at: "2026-11-27T00:00:04Z",
                  },
                ]
              : []),
          ],
        }),
      );
      return;
    }
    if (req.url === "/api/show") {
      const body = JSON.parse(raw);
      if (body.model === model)
        res.end(JSON.stringify({ modelfile: `FROM ${old}` }));
      else if (body.model === alias)
        res.end(
          JSON.stringify({
            details: { format: "gguf" },
            model_info: { "general.architecture": "llama" },
          }),
        );
      else {
        res.statusCode = 404;
        res.end();
      }
      return;
    }
    if (req.url === `/api/blobs/sha256:${sha}` && req.method === "HEAD") {
      res.statusCode = 200;
      res.end();
      return;
    }
    if (req.url === "/api/create" && req.method === "POST") {
      const body = JSON.parse(raw);
      expect(body).toEqual({
        model: expect.stringMatching(/^nexus-archive-[a-f0-9-]{36}:latest$/),
        files: { "model.gguf": `sha256:${sha}` },
        stream: false,
      });
      alias = body.model;
      await fs.writeFile(
        path.join(storeRoot, "fixture-manifest.json"),
        JSON.stringify(body),
        { flag: "wx" },
      );
      res.end(JSON.stringify({ status: "success" }));
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
      state: "created",
      alias,
      manifestDigest,
      runtimeImported: true,
      inferenceReady: false,
    });
    expect(calls.filter((x) => x === "POST /api/create")).toHaveLength(1);
    expect(calls.some((x) => /generate|delete|pull|chat/.test(x))).toBe(false);
    expect(await fs.readFile(path.join(f.dir, "model.gguf"))).toEqual(bytes);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await fs.rm(f.dir, { recursive: true, force: true });
    await fs.rm(storeRoot, { recursive: true, force: true });
  }
});

test("desktop and phone explicitly create one new model after presence/source review and preserve default selection", async ({
  page,
  context,
}, info) => {
  await fixtureRole(context);
  let record: any;
  await fixture(async () => {
    record = (await readHubArchive(signal())).records[0];
  });
  let creates = 0;
  const runId = randomUUID(),
    alias = `nexus-archive-${runId}:latest`;
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
          notice: "Historical records",
        },
      });
    if (body.action === "check-runtime-blob")
      return route.fulfill({
        json: {
          slot: record.slot,
          receiptSha256: record.receiptSha256,
          stageRunId: record.runtimeBlob.receipt.runId,
          sha256: sha,
          bytes: bytes.length,
          recordedStageState: "unconfirmed",
          state: "present-reported",
          checkedAt: new Date().toISOString(),
          runtimeImported: false,
          inferenceReady: false,
        },
      });
    creates++;
    expect(body).toEqual({
      action: "create-runtime-model",
      slot: record.slot,
      receiptSha256: record.receiptSha256,
      stageRunId: record.runtimeBlob.receipt.runId,
      expectedLicense: record.reportedLicense,
      licenseReviewed: true,
      createOnly: true,
    });
    return route.fulfill({
      json: {
        version: 1,
        kind: "runtime-model-create",
        runId,
        slot: record.slot,
        receiptSha256: record.receiptSha256,
        stageRunId: record.runtimeBlob.receipt.runId,
        sha256: sha,
        bytes: bytes.length,
        alias,
        state: "created",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        manifestDigest,
        architecture: "llama",
        runtimeImported: true,
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
  await expect(
    page.getByRole("region", {
      name: "Runtime model creation asset-000",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Check runtime blob · asset-000",
      exact: true,
    })
    .click();
  const panel = page.getByRole("region", {
      name: "Runtime model creation asset-000",
      exact: true,
    }),
    button = panel.getByRole("button", {
      name: "Create new local model · asset-000",
      exact: true,
    });
  expect(creates).toBe(0);
  await expect(button).toBeDisabled();
  await panel.getByRole("checkbox").check();
  await button.click();
  await expect(
    panel.getByText("Runtime reports a new local model", { exact: true }),
  ).toBeVisible();
  await expect(panel).toContainText(alias);
  await expect(panel).toContainText("Your default selection was not changed");
  await expect(button).toBeDisabled();
  expect(creates).toBe(1);
  await panel.scrollIntoViewIfNeeded();
  await fs.mkdir("artifacts/runtime-model-create", { recursive: true });
  await panel.screenshot({
    path: `artifacts/runtime-model-create/${info.project.name}.png`,
  });
  expect(
    await panel.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
});

test("post-create source and staging edits retain uncertainty rather than accepted success", async () => {
  for (const mode of ["source", "stage"])
    await fixture(async (f) => {
      const original = global.fetch;
      global.fetch = async (url, options) => {
        const result = await original(url, options);
        if (String(url).endsWith("/api/create")) {
          if (mode === "source")
            await fs.appendFile(path.join(f.dir, "model.gguf"), "changed");
          else
            await fs.writeFile(
              path.join(f.dir, "runtime-blob-stage.json"),
              JSON.stringify({ ...f.stage, state: "failed" }),
            );
        }
        return result;
      };
      await expect(createRuntimeModel(f.input, signal())).rejects.toThrow(
        /not confirmed/,
      );
      expect(
        JSON.parse(
          await fs.readFile(
            path.join(f.dir, "runtime-model-create.json"),
            "utf8",
          ),
        ).state,
      ).toBe("unconfirmed");
    });
});
test("rejected, unavailable and oversized creation responses are never retried or exposed as private errors", async () => {
  for (const mode of ["rejected", "unavailable", "oversized"])
    await fixture(async (f) => {
      const original = global.fetch;
      let attempts = 0;
      global.fetch = async (url, options) => {
        if (!String(url).endsWith("/api/create")) return original(url, options);
        attempts++;
        if (mode === "unavailable") throw Error("PRIVATE RUNTIME PATH");
        return mode === "rejected"
          ? new Response("PRIVATE RUNTIME PATH", { status: 500 })
          : Response.json({
              status: "success",
              privateData: "x".repeat(32001),
            });
      };
      await expect(createRuntimeModel(f.input, signal())).rejects.toThrow(
        "Model creation was not confirmed.",
      );
      expect(attempts).toBe(1);
      const raw = await fs.readFile(
        path.join(f.dir, "runtime-model-create.json"),
        "utf8",
      );
      expect(JSON.parse(raw).state).toBe("unconfirmed");
      expect(raw).not.toContain("PRIVATE");
    });
});
test("unknown storage or an oversized catalog cannot issue model creation", () =>
  fixture(async (f, calls) => {
    const original = global.fetch;
    global.fetch = async (url, options) =>
      String(url).endsWith("/api/show") &&
      JSON.parse(String(options?.body)).model === model
        ? Response.json({ modelfile: "FROM /foreign/path" })
        : original(url, options);
    await expect(createRuntimeModel(f.input, signal())).rejects.toThrow(
      /Runtime storage/,
    );
    global.fetch = async (url, options) =>
      String(url).endsWith("/api/tags")
        ? Response.json({
            models: [
              {
                name: model,
                digest: "a".repeat(64),
                size: 10,
                modified_at: "2026-11-27T00:00:00Z",
              },
              ...Array.from({ length: 99 }, (_, i) => ({
                name: `z${i}:latest`,
                digest: "a".repeat(64),
                size: 10,
                modified_at: "2026-11-27T00:00:00Z",
              })),
            ],
          })
        : original(url, options);
    await expect(createRuntimeModel(f.input, signal())).rejects.toThrow(
      /complete inspection bounds/,
    );
    expect(calls.some((x) => x.endsWith("/api/create"))).toBe(false);
    expect(await fs.readdir(f.dir)).toEqual([
      "model.gguf",
      "receipt.json",
      "runtime-blob-stage.json",
    ]);
  }));
test("a source with missing architecture or zero tensors is rejected before runtime effects", () =>
  fixture(async (f, calls) => {
    const empty = Buffer.concat([Buffer.from("GGUF"), u32(3), u64(0), u64(0)]),
      digest = createHash("sha256").update(empty).digest("hex"),
      raw = JSON.stringify({
        ...f.source,
        expectedBytes: empty.length,
        bytes: empty.length,
        expectedSha256: digest,
        sha256: digest,
      }),
      receiptSha256 = createHash("sha256").update(raw).digest("hex");
    await fs.writeFile(path.join(f.dir, "model.gguf"), empty);
    await fs.writeFile(path.join(f.dir, "receipt.json"), raw);
    await fs.writeFile(
      path.join(f.dir, "runtime-blob-stage.json"),
      JSON.stringify({
        ...f.stage,
        receiptSha256,
        sha256: digest,
        bytes: empty.length,
      }),
    );
    await expect(
      createRuntimeModel({ ...f.input, receiptSha256 }, signal()),
    ).rejects.toThrow(/nonzero tensor count/);
    expect(calls).toHaveLength(0);
  }));
