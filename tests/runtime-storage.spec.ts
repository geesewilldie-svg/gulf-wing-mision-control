import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inspectRuntimeStorage } from "../lib/server/runtime-storage";
import { fixtureRole } from "./helpers/access";
const model = "fixture:latest",
  digest = "a".repeat(64),
  blob = "sha256-" + "b".repeat(64),
  signal = () => new AbortController().signal;
async function fixture(run: (root: string, file: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-storage-")),
    prior = process.env.OLLAMA_MODELS,
    sync = process.env.GW_SYNC_DATA_DIR,
    configured = process.env.GW_NEXUS_MODEL,
    transport = global.fetch,
    statfs = fs.statfs;
  process.env.OLLAMA_MODELS = path.join(root, "store");
  process.env.GW_SYNC_DATA_DIR = root;
  process.env.GW_NEXUS_MODEL = "fixture";
  const file = path.join(process.env.OLLAMA_MODELS, "blobs", blob);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, "local weight metadata fixture");
  global.fetch = async (url, options) => {
    expect(options?.redirect).toBe("error");
    if (String(url) === "http://127.0.0.1:11434/api/tags") {
      expect(options?.method).toBe("GET");
      return Response.json({
        models: [
          {
            name: model,
            digest,
            size: 32,
            modified_at: "2026-11-27T00:00:00Z",
          },
        ],
      });
    }
    expect(String(url)).toBe("http://127.0.0.1:11434/api/show");
    expect(JSON.parse(String(options?.body))).toEqual({
      model,
      verbose: false,
    });
    return Response.json({
      modelfile: `# private runtime configuration\nFROM "${file}"\nSYSTEM PRIVATE SYSTEM\n`,
      system: "PRIVATE SYSTEM",
    });
  };
  try {
    await run(root, file);
  } finally {
    global.fetch = transport;
    fs.statfs = statfs;
    if (prior === undefined) delete process.env.OLLAMA_MODELS;
    else process.env.OLLAMA_MODELS = prior;
    if (sync === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = sync;
    if (configured === undefined) delete process.env.GW_NEXUS_MODEL;
    else process.env.GW_NEXUS_MODEL = configured;
    await fs.rm(root, { recursive: true, force: true });
  }
}
test("runtime-reported blob must match the known host store before read-only capacity observation", () =>
  fixture(async (root, file) => {
    const before = await fs.stat(file),
      bytes = await fs.readFile(file);
    const result = await inspectRuntimeStorage(1024, signal());
    expect(result).toMatchObject({
      state: "observed",
      source: "server-environment",
      reportedModel: model,
      requiredBytes: 1024 * 2 + 1024 ** 3,
    });
    expect(result.availableBytes).toBeGreaterThan(0);
    expect(result.capacity).toBe(
      result.availableBytes! >= result.requiredBytes
        ? "enough-at-check"
        : "insufficient",
    );
    expect(JSON.stringify(result)).not.toContain(root);
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(await fs.readFile(file)).toEqual(bytes);
    expect((await fs.stat(file)).mtimeMs).toBe(before.mtimeMs);
    expect(await fs.readdir(path.dirname(file))).toEqual([blob]);
  }));
test("capacity uses both store and blob locations and reports insufficient or unknown without reserving space", () =>
  fixture(async (_root) => {
    const original = fs.statfs;
    let calls = 0;
    (fs as any).statfs = async () => {
      calls++;
      return { bavail: BigInt(1), bsize: BigInt(4096) };
    };
    expect((await inspectRuntimeStorage(1024, signal())).capacity).toBe(
      "insufficient",
    );
    expect(calls).toBe(2);
    (fs as any).statfs = async () => ({
      bavail: BigInt(-1),
      bsize: BigInt(4096),
    });
    expect((await inspectRuntimeStorage(1024, signal())).capacity).toBe(
      "unknown",
    );
    fs.statfs = original;
  }));
test("foreign, remote, relative and ambiguous reported paths never become observed storage", () =>
  fixture(async (_root, file) => {
    const original = global.fetch;
    for (const data of [
      { modelfile: "FROM /private/sha256-" + "c".repeat(64) },
      { modelfile: "FROM relative/path" },
      { modelfile: `FROM ${file}\nFROM ${file}` },
      { modelfile: `FROM ${file}`, remote_host: "https://remote.invalid" },
    ]) {
      global.fetch = async (url, options) =>
        String(url).endsWith("/show")
          ? Response.json(data)
          : original(url, options);
      expect((await inspectRuntimeStorage(1024, signal())).state).toBe(
        "unavailable",
      );
    }
    global.fetch = original;
  }));
test("symlinked roots or blobs and changing catalog/file identities reject capacity acceptance", () =>
  fixture(async (root, file) => {
    const original = global.fetch;
    let tags = 0;
    global.fetch = async (url, options) => {
      if (String(url).endsWith("/tags") && ++tags === 2)
        await fs.appendFile(file, "changed");
      return original(url, options);
    };
    expect((await inspectRuntimeStorage(1024, signal())).state).toBe(
      "unavailable",
    );
    global.fetch = original;
    await fs.unlink(file);
    await fs.symlink(path.join(root, "target"), file);
    expect((await inspectRuntimeStorage(1024, signal())).state).toBe(
      "unavailable",
    );
  }));
test("cancelled or invalid observations never make a runtime call or accept storage", () =>
  fixture(async () => {
    let calls = 0;
    global.fetch = async () => {
      calls++;
      return Response.json({ models: [] });
    };
    for (const bytes of [0, -1, 5 * 1024 ** 3])
      await expect(inspectRuntimeStorage(bytes, signal())).rejects.toThrow();
    expect(calls).toBe(0);
    const c = new AbortController();
    c.abort();
    await expect(inspectRuntimeStorage(1024, c.signal)).rejects.toThrow(
      /cancelled/,
    );
    expect(calls).toBe(0);
  }));
test("new storage-review action retains controller, origin and exact-field guards", async ({
  context,
}) => {
  const request = (data: any) =>
    context.request.post("/api/sync/models/hub/archive", { data });
  const body = {
    action: "import-storage-review",
    slot: "asset-000",
    receiptSha256: digest,
  };
  expect((await request(body)).status()).toBe(401);
  await fixtureRole(context, "display");
  expect((await request(body)).status()).toBe(403);
  await fixtureRole(context);
  expect(
    (
      await context.request.post("/api/sync/models/hub/archive", {
        data: body,
        headers: { Origin: "https://foreign.invalid" },
      })
    ).status(),
  ).toBe(403);
  expect((await request({ ...body, path: "/private" })).status()).toBe(400);
});
test("desktop and phone request storage discovery only explicitly and show observed capacity without importing", async ({
  page,
  context,
}, info) => {
  await fixtureRole(context);
  let storageCalls = 0;
  const record = {
    slot: "asset-000",
    runId: "fixture-run",
    state: "verified",
    repository: "owner/model",
    revision: "a".repeat(40),
    sourceFilename: "model.gguf",
    reportedLicense: "apache-2.0",
    recordedBytes: 128,
    recordedSha256: digest,
    recordedAt: new Date().toISOString(),
    fileState: "size-matches-record",
    fileBytes: 128,
    partialPresent: false,
    receiptSha256: "c".repeat(64),
  };
  const review = {
    slot: record.slot,
    runId: record.runId,
    receiptSha256: record.receiptSha256,
    bytes: 128,
    sha256: digest,
    hashCheckedAt: new Date().toISOString(),
    metadata: { architecture: "llama", contextLength: 4096 },
    runtime: { state: "version-reported", version: "0.9.0" },
    hostMemory: { totalBytes: 8 * 1024 ** 3, freeBytes: 4 * 1024 ** 3 },
    recordedLicense: "apache-2.0",
    blockers: ["Recheck storage before import."],
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
    storageCalls++;
    expect(body).toEqual({
      action: "import-storage-review",
      slot: record.slot,
      receiptSha256: record.receiptSha256,
    });
    return route.fulfill({
      json: {
        ...review,
        runtimeStorage: {
          state: "observed",
          source: "server-user-default",
          reportedModel: model,
          availableBytes: 20 * 1024 ** 3,
          requiredBytes: 1024 ** 3 + 256,
          capacity: "enough-at-check",
          checkedAt: new Date().toISOString(),
        },
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
    name: "Import review asset-000",
    exact: true,
  });
  await panel
    .getByRole("button", {
      name: "Review runtime import · asset-000",
      exact: true,
    })
    .click();
  expect(storageCalls).toBe(0);
  await panel
    .getByRole("button", {
      name: "Inspect Ollama storage · asset-000",
      exact: true,
    })
    .click();
  const result = panel.getByRole("region", {
    name: "Ollama storage result asset-000",
    exact: true,
  });
  await expect(result.getByText("20.0 GiB", { exact: true })).toBeVisible();
  await expect(
    result.getByText("Enough at check time; not reserved", { exact: true }),
  ).toBeVisible();
  expect(storageCalls).toBe(1);
  await result.scrollIntoViewIfNeeded();
  await fs.mkdir("artifacts/runtime-storage", { recursive: true });
  await result.screenshot({
    path: `artifacts/runtime-storage/${info.project.name}.png`,
  });
  expect(
    await result.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await expect(
    panel.getByText("Archive checked; creation is a separate action", {
      exact: true,
    }),
  ).toBeVisible();
});

test("compiled storage-review action preserves archive bytes and returns unknown when runtime has no matching model", async ({
  context,
}) => {
  const { createHash, randomUUID } = await import("node:crypto"),
    { createServer } = await import("node:http");
  const bytes = Buffer.alloc(24);
  bytes.write("GGUF");
  bytes.writeUInt32LE(3, 4);
  const sha = createHash("sha256").update(bytes).digest("hex");
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
    archiveFile: "asset-099/model.gguf",
    licenseReviewed: true,
    archiveOnly: true,
    runtimeImported: false,
    inferenceReady: false,
    bytes: bytes.length,
    sha256: sha,
    receiptState: "saved",
    downloaded: true,
  };
  const dir = path.join(
      process.env.GW_SYNC_TEST_ROOT!,
      "model-assets/asset-099",
    ),
    raw = JSON.stringify(receipt);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "receipt.json"), raw);
  await fs.writeFile(path.join(dir, "model.gguf"), bytes);
  const calls: string[] = [];
  const server = createServer((req, res) => {
    calls.push(`${req.method} ${req.url}`);
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify(
        req.url === "/api/version" ? { version: "0.9.0" } : { models: [] },
      ),
    );
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(11434, "127.0.0.1", resolve);
  });
  try {
    await fixtureRole(context);
    const response = await context.request.post(
      "/api/sync/models/hub/archive",
      {
        data: {
          action: "import-storage-review",
          slot: "asset-099",
          receiptSha256: createHash("sha256").update(raw).digest("hex"),
        },
      },
    );
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      runtimeStorage: { state: "unavailable", capacity: "unknown" },
      runtimeImported: false,
      importImplemented: true,
      runtimeStorageVerified: false,
    });
    expect(calls).toEqual(["GET /api/version", "GET /api/tags"]);
    expect(await fs.readFile(path.join(dir, "model.gguf"))).toEqual(bytes);
    expect(await fs.readFile(path.join(dir, "receipt.json"), "utf8")).toBe(raw);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await fs.rm(dir, { recursive: true, force: true });
  }
});
