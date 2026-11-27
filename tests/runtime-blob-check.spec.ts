import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { checkRuntimeBlob } from "../lib/server/runtime-blob-check";
import { readHubArchive } from "../lib/server/hub-archive-history";
import { fixtureRole } from "./helpers/access";
const bytes = Buffer.from("GGUF current presence fixture"),
  sha = createHash("sha256").update(bytes).digest("hex"),
  signal = () => new AbortController().signal;
async function archive(
  root: string,
  state = "unconfirmed",
  slot = "asset-000",
) {
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
      state,
      startedAt: "2026-11-27T00:00:02.000Z",
      ...(state !== "started"
        ? { finishedAt: "2026-11-27T00:00:03.000Z" }
        : {}),
      runtimeImported: false,
      inferenceReady: false,
    };
  await fs.writeFile(path.join(dir, "receipt.json"), raw);
  await fs.writeFile(path.join(dir, "model.gguf"), bytes);
  await fs.writeFile(
    path.join(dir, "runtime-blob-stage.json"),
    JSON.stringify(stage),
  );
  return {
    dir,
    source,
    stage,
    input: {
      action: "check-runtime-blob",
      slot,
      receiptSha256,
      stageRunId: stage.runId,
    },
  };
}
async function fixture(run: (root: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-presence-")),
    prior = process.env.GW_SYNC_DATA_DIR,
    transport = global.fetch;
  process.env.GW_SYNC_DATA_DIR = root;
  global.fetch = async (url, options) => {
    expect(String(url)).toBe(`http://127.0.0.1:11434/api/blobs/sha256:${sha}`);
    expect(options).toMatchObject({
      method: "HEAD",
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
    });
    expect(options?.body).toBeUndefined();
    return new Response(null, { status: 200 });
  };
  try {
    await run(root);
  } finally {
    global.fetch = transport;
    if (prior === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = prior;
    await fs.rm(root, { recursive: true, force: true });
  }
}
test("present/missing reports remain separate from every preserved historical stage outcome", () =>
  fixture(async (root) => {
    for (const state of [
      "started",
      "staged",
      "unconfirmed",
      "failed",
      "cancelled",
    ]) {
      const f = await archive(root, state);
      const originals = await Promise.all(
        ["model.gguf", "receipt.json", "runtime-blob-stage.json"].map(
          async (name) => ({
            name,
            bytes: await fs.readFile(path.join(f.dir, name)),
            mtime: (await fs.stat(path.join(f.dir, name))).mtimeMs,
          }),
        ),
      );
      for (const status of [200, 404]) {
        let calls = 0;
        global.fetch = async (url, options) => {
          calls++;
          expect(String(url)).toBe(
            `http://127.0.0.1:11434/api/blobs/sha256:${sha}`,
          );
          expect(options?.method).toBe("HEAD");
          expect(options?.body).toBeUndefined();
          return new Response(null, { status });
        };
        expect(await checkRuntimeBlob(f.input, signal())).toMatchObject({
          state: status === 200 ? "present-reported" : "missing-reported",
          recordedStageState: state,
          stageRunId: f.stage.runId,
          runtimeImported: false,
          inferenceReady: false,
        });
        expect(calls).toBe(1);
      }
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
        "runtime-blob-stage.json",
      ]);
      await fs.rm(f.dir, { recursive: true, force: true });
    }
  }));
test("invalid input, stale source/run identity and unsafe stage evidence never query the runtime", () =>
  fixture(async (root) => {
    const f = await archive(root);
    let calls = 0;
    global.fetch = async () => {
      calls++;
      return new Response(null, { status: 200 });
    };
    for (const input of [
      { ...f.input, path: "/private" },
      { ...f.input, slot: "../asset-000" },
      { ...f.input, stageRunId: "bad" },
      { ...f.input, receiptSha256: "a".repeat(64) },
      { ...f.input, stageRunId: randomUUID() },
    ])
      await expect(checkRuntimeBlob(input, signal())).rejects.toThrow();
    expect(calls).toBe(0);
    await fs.unlink(path.join(f.dir, "runtime-blob-stage.json"));
    await fs.symlink(
      path.join(f.dir, "receipt.json"),
      path.join(f.dir, "runtime-blob-stage.json"),
    );
    await expect(checkRuntimeBlob(f.input, signal())).rejects.toThrow(
      /receipt/,
    );
    expect(calls).toBe(0);
  }));
test("unsupported runtime responses and network errors do not become missing reports or retries", () =>
  fixture(async (root) => {
    const f = await archive(root);
    for (const status of [302, 401, 429, 500]) {
      let calls = 0;
      global.fetch = async () => {
        calls++;
        return new Response(null, { status });
      };
      await expect(checkRuntimeBlob(f.input, signal())).rejects.toThrow(
        /supported presence response/,
      );
      expect(calls).toBe(1);
    }
    global.fetch = async () => {
      throw Error("PRIVATE ERROR");
    };
    await expect(checkRuntimeBlob(f.input, signal())).rejects.toThrow(
      /could not be completed/,
    );
  }));
test("source or staging changes during the HEAD request invalidate acceptance", () =>
  fixture(async (root) => {
    const f = await archive(root);
    global.fetch = async () => {
      await fs.writeFile(
        path.join(f.dir, "runtime-blob-stage.json"),
        JSON.stringify({ ...f.stage, state: "failed" }),
      );
      return new Response(null, { status: 200 });
    };
    await expect(checkRuntimeBlob(f.input, signal())).rejects.toThrow(
      /receipt changed/,
    );
    await fs.writeFile(
      path.join(f.dir, "runtime-blob-stage.json"),
      JSON.stringify(f.stage),
    );
    global.fetch = async () => {
      const other = Buffer.from(bytes);
      other[other.length - 1] ^= 1;
      await fs.writeFile(path.join(f.dir, "model.gguf"), other);
      return new Response(null, { status: 200 });
    };
    await expect(checkRuntimeBlob(f.input, signal())).rejects.toThrow();
  }));
test("cancelled checks release source-check admission and preserve receipts", () =>
  fixture(async (root) => {
    const f = await archive(root),
      original = await fs.readFile(path.join(f.dir, "runtime-blob-stage.json"));
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
      pending = checkRuntimeBlob(f.input, c.signal),
      rejected = expect(pending).rejects.toThrow(/cancelled/);
    await reached;
    await expect(checkRuntimeBlob(f.input, signal())).rejects.toThrow(
      /already active/,
    );
    c.abort();
    await rejected;
    global.fetch = async () => new Response(null, { status: 404 });
    expect((await checkRuntimeBlob(f.input, signal())).state).toBe(
      "missing-reported",
    );
    expect(
      await fs.readFile(path.join(f.dir, "runtime-blob-stage.json")),
    ).toEqual(original);
  }));
test("compiled API keeps controller/origin guards and reports current presence without mutations", async ({
  context,
}) => {
  const f = await archive(
      process.env.GW_SYNC_TEST_ROOT!,
      "unconfirmed",
      "asset-099",
    ),
    { createServer } = await import("node:http");
  let status = 200;
  const calls: string[] = [];
  const server = createServer((req, res) => {
    calls.push(`${req.method} ${req.url}`);
    res.statusCode = status;
    res.end();
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(11434, "127.0.0.1", resolve);
  });
  const original = await fs.readFile(
    path.join(f.dir, "runtime-blob-stage.json"),
  );
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
          data: { ...f.input, url: "https://foreign.invalid" },
        })
      ).status(),
    ).toBe(400);
    expect(calls).toHaveLength(0);
    for (status of [200, 404]) {
      const response = await context.request.post(
        "/api/sync/models/hub/archive",
        { data: f.input },
      );
      expect(response.status()).toBe(200);
      expect(await response.json()).toMatchObject({
        state: status === 200 ? "present-reported" : "missing-reported",
        recordedStageState: "unconfirmed",
      });
    }
    expect(calls).toEqual([
      `HEAD /api/blobs/sha256:${sha}`,
      `HEAD /api/blobs/sha256:${sha}`,
    ]);
    expect(
      await fs.readFile(path.join(f.dir, "runtime-blob-stage.json")),
    ).toEqual(original);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await fs.rm(f.dir, { recursive: true, force: true });
  }
});
test("desktop and phone explicitly check/export current presence while keeping historical uncertainty", async ({
  page,
  context,
}, info) => {
  await fixtureRole(context);
  let record: any, result: any;
  await fixture(async (root) => {
    const f = await archive(root);
    record = (await readHubArchive(signal())).records[0];
    result = await checkRuntimeBlob(f.input, signal());
  });
  let calls = 0,
    missing = false,
    stale = false,
    deny = false;
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
    calls++;
    expect(body).toEqual({
      action: "check-runtime-blob",
      slot: record.slot,
      receiptSha256: record.receiptSha256,
      stageRunId: record.runtimeBlob.receipt.runId,
    });
    return deny
      ? route.fulfill({ status: 403, json: { error: "Controller required" } })
      : route.fulfill({
          json: {
            ...result,
            state: missing ? "missing-reported" : "present-reported",
            stageRunId: stale ? randomUUID() : result.stageRunId,
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
    name: "Runtime presence check asset-000",
    exact: true,
  });
  expect(calls).toBe(0);
  await panel
    .getByRole("button", {
      name: "Check runtime blob · asset-000",
      exact: true,
    })
    .click();
  await expect(
    panel.getByText("Runtime reports blob present", { exact: true }),
  ).toBeVisible();
  await expect(panel).toContainText("unconfirmed, unchanged");
  const download = page.waitForEvent("download");
  await panel
    .getByRole("button", {
      name: "Download runtime blob check · asset-000",
      exact: true,
    })
    .click();
  expect((await download).suggestedFilename()).toBe(
    "nexus-runtime-blob-check-asset-000.json",
  );
  await panel.scrollIntoViewIfNeeded();
  await fs.mkdir("artifacts/runtime-blob-check", { recursive: true });
  await panel.screenshot({
    path: `artifacts/runtime-blob-check/${info.project.name}.png`,
  });
  expect(
    await panel.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  missing = true;
  await panel
    .getByRole("button", {
      name: "Check runtime blob · asset-000",
      exact: true,
    })
    .click();
  await expect(
    panel.getByText("Runtime reports blob missing", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByText("Runtime reports blob present", { exact: true }),
  ).toHaveCount(0);
  stale = true;
  await panel
    .getByRole("button", {
      name: "Check runtime blob · asset-000",
      exact: true,
    })
    .click();
  await expect(
    panel.getByText(
      "The source or staging identity changed. Inspect the archive again.",
    ),
  ).toBeVisible();
  deny = true;
  await panel
    .getByRole("button", {
      name: "Check runtime blob · asset-000",
      exact: true,
    })
    .click();
  await expect(
    panel.getByText("Controller required", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", {
      name: "Download runtime blob check · asset-000",
      exact: true,
    }),
  ).toHaveCount(0);
});
