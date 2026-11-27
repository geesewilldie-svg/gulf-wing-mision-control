import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { checkRuntimeModel } from "../lib/server/runtime-model-check";
import { readHubArchive } from "../lib/server/hub-archive-history";
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
    Buffer.from("test tensor bytes"),
  ]),
  sha = createHash("sha256").update(bytes).digest("hex"),
  manifestDigest = "c".repeat(64),
  signal = () => new AbortController().signal;
async function archive(root: string, state = "created", slot = "asset-000") {
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
    runId = randomUUID(),
    alias = `nexus-archive-${runId}:latest`,
    creation = {
      version: 1,
      kind: "runtime-model-create",
      runId,
      slot,
      receiptSha256,
      stageRunId: randomUUID(),
      sha256: sha,
      bytes: bytes.length,
      alias,
      state,
      startedAt: "2026-11-27T00:00:02.000Z",
      ...(state !== "started"
        ? { finishedAt: "2026-11-27T00:00:03.000Z" }
        : {}),
      ...(state === "created" ? { manifestDigest, architecture: "llama" } : {}),
      runtimeImported: state === "created",
      inferenceReady: false,
    };
  await fs.writeFile(path.join(dir, "model.gguf"), bytes);
  await fs.writeFile(path.join(dir, "receipt.json"), raw);
  await fs.writeFile(
    path.join(dir, "runtime-model-create.json"),
    JSON.stringify(creation),
  );
  return {
    dir,
    creation,
    source,
    input: {
      action: "check-runtime-model",
      slot,
      receiptSha256,
      creationRunId: runId,
    },
  };
}
async function fixture(
  run: (
    f: Awaited<ReturnType<typeof archive>>,
    calls: string[],
  ) => Promise<void>,
  state = "created",
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-model-check-")),
    prior = process.env.GW_SYNC_DATA_DIR,
    selected = process.env.GW_NEXUS_MODEL,
    transport = global.fetch;
  process.env.GW_SYNC_DATA_DIR = root;
  process.env.GW_NEXUS_MODEL = "fixture";
  const f = await archive(root, state),
    calls: string[] = [];
  global.fetch = async (url, options) => {
    calls.push(`${options?.method} ${url}`);
    expect(options?.redirect).toBe("error");
    if (String(url) === "http://127.0.0.1:11434/api/tags")
      return Response.json({
        models: [
          {
            name: f.creation.alias,
            digest: manifestDigest,
            size: bytes.length,
            modified_at: "2026-11-27T00:00:04Z",
          },
        ],
      });
    expect(String(url)).toBe("http://127.0.0.1:11434/api/show");
    expect(JSON.parse(String(options?.body))).toEqual({
      model: f.creation.alias,
      verbose: false,
    });
    expect(options?.credentials).toBe("omit");
    return Response.json({
      details: { format: "gguf", quantization_level: "Q4_K_M" },
      model_info: {
        "general.architecture": "llama",
        "llama.context_length": 4096,
      },
      capabilities: ["completion"],
      modelfile: "PRIVATE PATH",
      system: "PRIVATE SYSTEM",
    });
  };
  try {
    await run(f, calls);
  } finally {
    global.fetch = transport;
    if (prior === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = prior;
    if (selected === undefined) delete process.env.GW_NEXUS_MODEL;
    else process.env.GW_NEXUS_MODEL = selected;
    await fs.rm(root, { recursive: true, force: true });
  }
}
test("current inspection binds source/run/catalog identity without generation or receipt mutation", () =>
  fixture(async (f, calls) => {
    const originals = await Promise.all(
      ["model.gguf", "receipt.json", "runtime-model-create.json"].map(
        async (name) => ({
          name,
          bytes: await fs.readFile(path.join(f.dir, name)),
          mtime: (await fs.stat(path.join(f.dir, name))).mtimeMs,
        }),
      ),
    );
    const result = await checkRuntimeModel(f.input, signal());
    expect(result).toMatchObject({
      state: "matches-record",
      alias: f.creation.alias,
      currentManifestDigest: manifestDigest,
      expectedManifestDigest: manifestDigest,
      recordedCreationState: "created",
      details: {
        architecture: "llama",
        quantization: "Q4_K_M",
        contextLength: 4096,
      },
    });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(calls.filter((c) => c.startsWith("POST"))).toEqual([
      "POST http://127.0.0.1:11434/api/show",
    ]);
    expect(process.env.GW_NEXUS_MODEL).toBe("fixture");
    for (const original of originals) {
      expect(await fs.readFile(path.join(f.dir, original.name))).toEqual(
        original.bytes,
      );
      expect((await fs.stat(path.join(f.dir, original.name))).mtimeMs).toBe(
        original.mtime,
      );
    }
    expect(await fs.readdir(f.dir)).toEqual([
      "model.gguf",
      "receipt.json",
      "runtime-model-create.json",
    ]);
  }));
test("listed models after uncertain creation do not promote historical outcomes", async () => {
  for (const state of ["started", "unconfirmed", "failed", "cancelled"])
    await fixture(async (f) => {
      const original = await fs.readFile(
        path.join(f.dir, "runtime-model-create.json"),
      );
      expect(await checkRuntimeModel(f.input, signal())).toMatchObject({
        state: "present-unconfirmed",
        recordedCreationState: state,
        expectedManifestDigest: null,
        currentManifestDigest: manifestDigest,
      });
      expect(
        await fs.readFile(path.join(f.dir, "runtime-model-create.json")),
      ).toEqual(original);
    }, state);
});
test("changed digests/formats differ from unknown identity fields", () =>
  fixture(async (f) => {
    const original = global.fetch;
    for (const mode of ["digest", "format", "unknown", "nodigest"]) {
      global.fetch = async (url, options) => {
        if (String(url).endsWith("/tags"))
          return Response.json({
            models: [
              {
                name: f.creation.alias,
                digest:
                  mode === "digest"
                    ? "d".repeat(64)
                    : mode === "nodigest"
                      ? null
                      : manifestDigest,
                size: bytes.length,
                modified_at: "2026-11-27T00:00:04Z",
              },
            ],
          });
        if (mode === "format")
          return Response.json({
            details: { format: "safetensors" },
            model_info: { "general.architecture": "llama" },
            capabilities: ["completion"],
          });
        if (mode === "unknown")
          return Response.json({
            details: { format: "gguf" },
            model_info: {},
            capabilities: ["completion"],
          });
        return original(url, options);
      };
      expect((await checkRuntimeModel(f.input, signal())).state).toBe(
        mode === "unknown" || mode === "nodigest"
          ? "identity-unavailable"
          : "changed",
      );
    }
    global.fetch = original;
  }));
test("absence is reported only within complete valid catalog coverage", () =>
  fixture(async (f, calls) => {
    for (const mode of ["complete", "omitted", "invalid"]) {
      calls.length = 0;
      global.fetch = async (url, options) => {
        calls.push(`${options?.method} ${url}`);
        expect(String(url)).toBe("http://127.0.0.1:11434/api/tags");
        return Response.json({
          models:
            mode === "complete"
              ? []
              : mode === "invalid"
                ? [{ name: "bad\nname" }]
                : Array.from({ length: 101 }, (_, i) => ({
                    name: `a${String(i).padStart(3, "0")}:latest`,
                    digest: manifestDigest,
                    size: 1,
                  })),
        });
      };
      expect((await checkRuntimeModel(f.input, signal())).state).toBe(
        mode === "complete" ? "not-listed" : "coverage-incomplete",
      );
      expect(calls).toHaveLength(2);
    }
  }));
test("stale/unsafe creation evidence, source tampering and caller model names never query the runtime", () =>
  fixture(async (f, calls) => {
    for (const input of [
      { ...f.input, model: "other" },
      { ...f.input, creationRunId: randomUUID() },
      { ...f.input, receiptSha256: "a".repeat(64) },
      { ...f.input, slot: "../asset-000" },
    ])
      await expect(checkRuntimeModel(input, signal())).rejects.toThrow();
    expect(calls).toHaveLength(0);
    await fs.appendFile(path.join(f.dir, "model.gguf"), "changed");
    await expect(checkRuntimeModel(f.input, signal())).rejects.toThrow();
    expect(calls).toHaveLength(0);
    await fs.writeFile(path.join(f.dir, "model.gguf"), bytes);
    await fs.unlink(path.join(f.dir, "runtime-model-create.json"));
    await fs.symlink(
      path.join(f.dir, "receipt.json"),
      path.join(f.dir, "runtime-model-create.json"),
    );
    await expect(checkRuntimeModel(f.input, signal())).rejects.toThrow(
      /receipt/,
    );
    expect(calls).toHaveLength(0);
  }));
test("changing receipt/catalog/default or remote metadata invalidates acceptance", () =>
  fixture(async (f) => {
    const original = global.fetch;
    let calls = 0;
    global.fetch = async (url, options) => {
      calls++;
      if (calls === 2)
        await fs.writeFile(
          path.join(f.dir, "runtime-model-create.json"),
          JSON.stringify({
            ...f.creation,
            state: "unconfirmed",
            runtimeImported: false,
          }),
        );
      return original(url, options);
    };
    await expect(checkRuntimeModel(f.input, signal())).rejects.toThrow(
      /evidence changed/,
    );
    await fs.writeFile(
      path.join(f.dir, "runtime-model-create.json"),
      JSON.stringify(f.creation),
    );
    calls = 0;
    global.fetch = async (url, options) => {
      calls++;
      const result = await original(url, options);
      if (calls === 3) process.env.GW_NEXUS_MODEL = "changed";
      return result;
    };
    await expect(checkRuntimeModel(f.input, signal())).rejects.toThrow();
    process.env.GW_NEXUS_MODEL = "fixture";
    global.fetch = async (url, options) =>
      String(url).endsWith("/show")
        ? Response.json({ remote_host: "https://remote.invalid" })
        : original(url, options);
    await expect(checkRuntimeModel(f.input, signal())).rejects.toThrow(
      /remote model/,
    );
  }));
test("cancellation releases source inspection admission without changing creation receipts", () =>
  fixture(async (f) => {
    const original = await fs.readFile(
      path.join(f.dir, "runtime-model-create.json"),
    );
    let entered!: () => void;
    const reached = new Promise<void>((resolve) => (entered = resolve));
    global.fetch = async (_url, options) => {
      entered();
      return new Promise((_resolve, reject) =>
        options?.signal?.addEventListener(
          "abort",
          () => reject(Error("cancelled")),
          { once: true },
        ),
      );
    };
    const c = new AbortController(),
      pending = checkRuntimeModel(f.input, c.signal),
      rejected = expect(pending).rejects.toThrow(/cancelled/);
    await reached;
    await expect(checkRuntimeModel(f.input, signal())).rejects.toThrow(
      /already active/,
    );
    c.abort();
    await rejected;
    global.fetch = async () => Response.json({ models: [] });
    expect((await checkRuntimeModel(f.input, signal())).state).toBe(
      "not-listed",
    );
    expect(
      await fs.readFile(path.join(f.dir, "runtime-model-create.json")),
    ).toEqual(original);
  }));
test("compiled API checks current identity and explicit diagnostic through an owned runtime with no creation", async ({
  context,
}) => {
  const f = await archive(
      process.env.GW_SYNC_TEST_ROOT!,
      "created",
      "asset-099",
    ),
    { createServer } = await import("node:http"),
    calls: string[] = [];
  const original = await fs.readFile(
    path.join(f.dir, "runtime-model-create.json"),
  );
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
              name: f.creation.alias,
              digest: manifestDigest,
              size: bytes.length,
              modified_at: "2026-11-27T00:00:04Z",
            },
          ],
        }),
      );
      return;
    }
    if (req.url === "/api/show") {
      expect(JSON.parse(raw)).toEqual({
        model: f.creation.alias,
        verbose: false,
      });
      res.end(
        JSON.stringify({
          details: { format: "gguf", quantization_level: "Q4_K_M" },
          model_info: { "general.architecture": "llama" },
          capabilities: ["completion"],
        }),
      );
      return;
    }
    if (req.url === "/api/generate") {
      const body = JSON.parse(raw);
      expect(body.model).toBe(f.creation.alias);
      expect(body.prompt).toBe(
        "Reply with exactly NEXUS_OK and no other text.",
      );
      expect(body.options).toEqual({
        num_predict: 8,
        num_ctx: 512,
        temperature: 0,
      });
      expect(body).not.toHaveProperty("context");
      res.end(
        JSON.stringify({
          model: f.creation.alias,
          done: true,
          response: "NEXUS_OK",
          eval_count: 5,
        }),
      );
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
    expect(
      (
        await context.request.post("/api/sync/models/hub/archive", {
          data: f.input,
        })
      ).status(),
    ).toBe(401);
    await fixtureRole(context, "display");
    expect(
      (
        await context.request.post("/api/sync/models/hub/archive", {
          data: f.input,
        })
      ).status(),
    ).toBe(403);
    await fixtureRole(context);
    expect(
      (
        await context.request.post("/api/sync/models/hub/archive", {
          data: f.input,
          headers: { Origin: "https://foreign.invalid" },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await context.request.post("/api/sync/models/hub/archive", {
          data: { ...f.input, model: "other" },
        })
      ).status(),
    ).toBe(400);
    expect(calls).toHaveLength(0);
    const checked = await context.request.post("/api/sync/models/hub/archive", {
      data: f.input,
    });
    expect(checked.status()).toBe(200);
    expect(await checked.json()).toMatchObject({
      state: "matches-record",
      currentManifestDigest: manifestDigest,
    });
    expect(calls.some((c) => /generate|create|delete|pull/.test(c))).toBe(
      false,
    );
    const diagnostic = await context.request.post("/api/sync/agents", {
      data: {
        action: "local-model-check",
        model: f.creation.alias,
        digest: manifestDigest,
        runTest: true,
      },
    });
    expect(diagnostic.status()).toBe(200);
    expect(await diagnostic.json()).toMatchObject({
      state: "passed",
      model: f.creation.alias,
    });
    expect(calls.filter((c) => c === "POST /api/generate")).toHaveLength(1);
    expect(calls.some((c) => /create|delete|pull/.test(c))).toBe(false);
    expect(
      await fs.readFile(path.join(f.dir, "runtime-model-create.json")),
    ).toEqual(original);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await fs.rm(f.dir, { recursive: true, force: true });
  }
});

test("desktop and phone link only matching identities to one explicit diagnostic and clear changed/stale results", async ({
  page,
  context,
}, info) => {
  await fixtureRole(context);
  let record: any, result: any;
  await fixture(async () => {
    record = (await readHubArchive(signal())).records[0];
    result = await checkRuntimeModel(
      {
        action: "check-runtime-model",
        slot: record.slot,
        receiptSha256: record.receiptSha256,
        creationRunId: record.runtimeModel.receipt.runId,
      },
      signal(),
    );
  });
  let inspections = 0,
    generations = 0,
    changed = false,
    stale = false,
    denied = false,
    finish!: () => void;
  const allowed = new Promise<void>((resolve) => (finish = resolve));
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
          notice: "Historical archive records",
        },
      });
    inspections++;
    expect(body).toEqual({
      action: "check-runtime-model",
      slot: record.slot,
      receiptSha256: record.receiptSha256,
      creationRunId: record.runtimeModel.receipt.runId,
    });
    return denied
      ? route.fulfill({ status: 403, json: { error: "Controller required" } })
      : route.fulfill({
          json: {
            ...result,
            creationRunId: stale ? randomUUID() : result.creationRunId,
            state: changed ? "changed" : "matches-record",
            currentManifestDigest: changed
              ? "d".repeat(64)
              : result.currentManifestDigest,
          },
        });
  });
  await page.route("**/api/sync/agents", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: { providers: [], events: [], workers: [], obsidian: false },
      });
    expect(route.request().postDataJSON()).toEqual({
      action: "local-model-check",
      model: record.runtimeModel.receipt.alias,
      digest: manifestDigest,
      runTest: true,
    });
    generations++;
    await allowed;
    return route.fulfill({
      json: {
        runId: randomUUID(),
        model: record.runtimeModel.receipt.alias,
        digest: manifestDigest,
        reportedModel: record.runtimeModel.receipt.alias,
        checkedAt: new Date().toISOString(),
        elapsedMs: 1234,
        state: "passed",
        reportedOutputTokens: 5,
        notice: "One fixed local diagnostic completed without private context.",
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
  const panel = page.getByRole("region", {
      name: "Runtime model inspection asset-000",
      exact: true,
    }),
    inspect = panel.getByRole("button", {
      name: "Inspect runtime model · asset-000",
      exact: true,
    });
  expect(inspections).toBe(0);
  expect(generations).toBe(0);
  await inspect.click();
  await expect(
    panel.getByText("Runtime identity matches the creation receipt", {
      exact: true,
    }),
  ).toBeVisible();
  expect(generations).toBe(0);
  const download = page.waitForEvent("download");
  await panel
    .getByRole("button", {
      name: "Download runtime model check · asset-000",
      exact: true,
    })
    .click();
  expect((await download).suggestedFilename()).toBe(
    "nexus-runtime-model-check-asset-000.json",
  );
  await panel
    .getByRole("button", {
      name: `Run local model check · ${record.runtimeModel.receipt.alias}`,
      exact: true,
    })
    .click();
  await expect.poll(() => generations).toBe(1);
  await expect(inspect).toBeDisabled();
  finish();
  await expect(
    panel.getByText("Fixed local test passed", { exact: true }),
  ).toBeVisible();
  await expect(inspect).toBeEnabled();
  await panel.scrollIntoViewIfNeeded();
  await fs.mkdir("artifacts/runtime-model-check", { recursive: true });
  await panel.screenshot({
    path: `artifacts/runtime-model-check/${info.project.name}.png`,
  });
  expect(
    await panel.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  changed = true;
  await inspect.click();
  await expect(
    panel.getByText("Runtime identity differs from creation evidence", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", {
      name: `Run local model check · ${record.runtimeModel.receipt.alias}`,
      exact: true,
    }),
  ).toHaveCount(0);
  stale = true;
  await inspect.click();
  await expect(
    panel.getByText(
      "The source or creation identity changed. Inspect the archive again.",
    ),
  ).toBeVisible();
  denied = true;
  await inspect.click();
  await expect(
    panel.getByText("Controller required", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", {
      name: "Download runtime model check · asset-000",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(generations).toBe(1);
});
