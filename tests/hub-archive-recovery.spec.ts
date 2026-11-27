import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash, randomUUID } from "node:crypto";
import {
  readHubArchive,
  reconcileHubArchive,
} from "../lib/server/hub-archive-history";
import { fixtureRole } from "./helpers/access";
const bytes = Buffer.from("GGUF published recovery fixture"),
  digest = createHash("sha256").update(bytes).digest("hex");
function receipt(slot = "asset-000", state = "publication-unconfirmed") {
  return {
    version: 1,
    kind: "hub-model-archive",
    runId: randomUUID(),
    state,
    startedAt: "2026-11-26T12:00:00.000Z",
    finishedAt: "2026-11-26T12:00:01.000Z",
    repository: "owner/model",
    revision: "a".repeat(40),
    sourceFilename: "model.gguf",
    reportedLicense: "apache-2.0",
    expectedBytes: bytes.length,
    expectedSha256: digest,
    archiveFile: slot + "/model.gguf",
    licenseReviewed: true,
    archiveOnly: true,
    runtimeImported: false,
    inferenceReady: false,
  };
}
async function fixture(run: (root: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "archive-recovery-")),
    prior = process.env.GW_SYNC_DATA_DIR,
    transport = global.fetch;
  process.env.GW_SYNC_DATA_DIR = root;
  global.fetch = async () => {
    throw Error("No source request permitted");
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
async function create(
  root: string,
  state = "publication-unconfirmed",
  slot = "asset-000",
) {
  const dir = path.join(root, "model-assets", slot);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "receipt.json"),
    JSON.stringify(receipt(slot, state)),
  );
  await fs.writeFile(path.join(dir, "model.gguf"), bytes);
  return dir;
}
const signal = () => new AbortController().signal;
async function proof() {
  return (await readHubArchive(signal())).records[0].receiptSha256!;
}

test("matching published files get a separate idempotent recovery receipt without changing original bytes or outcome", async () => {
  for (const state of ["started", "publication-unconfirmed"])
    await fixture(async (root) => {
      const dir = await create(root, state),
        source = await fs.readFile(path.join(dir, "receipt.json")),
        before = await fs.stat(path.join(dir, "model.gguf")),
        identity = await proof();
      const result = await reconcileHubArchive("asset-000", identity, signal());
      expect(result.verification.state).toBe("matches-record");
      expect(result.recovery?.state).toBe("saved");
      expect(await fs.readFile(path.join(dir, "receipt.json"))).toEqual(source);
      expect(await fs.readFile(path.join(dir, "model.gguf"))).toEqual(bytes);
      expect((await fs.stat(path.join(dir, "model.gguf"))).mtimeMs).toBe(
        before.mtimeMs,
      );
      const recoveryBytes = await fs.readFile(path.join(dir, "recovery.json")),
        record = JSON.parse(recoveryBytes.toString());
      expect(record.sourceReceiptSha256).toBe(identity);
      expect(record.observedSha256).toBe(digest);
      const again = await reconcileHubArchive("asset-000", identity, signal());
      expect(again.recovery?.state).toBe("already-recorded");
      expect(again.recovery?.recoveryId).toBe(result.recovery?.recoveryId);
      expect(await fs.readFile(path.join(dir, "recovery.json"))).toEqual(
        recoveryBytes,
      );
      const list = await readHubArchive(signal());
      expect(list.records[0].state).toBe(state);
      expect(list.records[0].recovery?.state).toBe("recorded");
    });
});

test("stale source identities, mismatching bytes and partial-only runs cannot create recovery metadata", async () => {
  await fixture(async (root) => {
    const dir = await create(root),
      identity = await proof();
    const source = JSON.parse(
      await fs.readFile(path.join(dir, "receipt.json"), "utf8"),
    );
    source.extra = "changed";
    await fs.writeFile(path.join(dir, "receipt.json"), JSON.stringify(source));
    await expect(
      reconcileHubArchive("asset-000", identity, signal()),
    ).rejects.toMatchObject({ status: 409 });
    await expect(fs.stat(path.join(dir, "recovery.json"))).rejects.toThrow();
    const current = await proof(),
      changed = Buffer.from(bytes);
    changed[4] ^= 1;
    await fs.writeFile(path.join(dir, "model.gguf"), changed);
    const mismatch = await reconcileHubArchive("asset-000", current, signal());
    expect(mismatch.verification.state).toBe("mismatch");
    expect(mismatch.recovery).toBeNull();
    await expect(fs.stat(path.join(dir, "recovery.json"))).rejects.toThrow();
    await fs.rename(
      path.join(dir, "model.gguf"),
      path.join(dir, "model.partial"),
    );
    await expect(
      reconcileHubArchive("asset-000", current, signal()),
    ).rejects.toThrow();
    expect(await fs.readdir(dir)).toEqual(["model.partial", "receipt.json"]);
  });
});

test("old, malformed and symlinked recovery metadata is retained rather than overwritten", async () => {
  await fixture(async (root) => {
    const dir = await create(root),
      identity = await proof();
    await reconcileHubArchive("asset-000", identity, signal());
    const original = await fs.readFile(path.join(dir, "recovery.json"));
    const source = JSON.parse(
      await fs.readFile(path.join(dir, "receipt.json"), "utf8"),
    );
    source.extra = "new source version";
    await fs.writeFile(path.join(dir, "receipt.json"), JSON.stringify(source));
    expect((await readHubArchive(signal())).records[0].recovery?.state).toBe(
      "source-changed",
    );
    await expect(
      reconcileHubArchive("asset-000", await proof(), signal()),
    ).rejects.toMatchObject({ status: 409 });
    expect(await fs.readFile(path.join(dir, "recovery.json"))).toEqual(
      original,
    );
  });
  await fixture(async (root) => {
    const dir = await create(root);
    await fs.writeFile(
      path.join(dir, "recovery.json"),
      "retained bad metadata",
    );
    await expect(
      reconcileHubArchive("asset-000", await proof(), signal()),
    ).rejects.toMatchObject({ status: 409 });
    expect(await fs.readFile(path.join(dir, "recovery.json"), "utf8")).toBe(
      "retained bad metadata",
    );
    await fs.unlink(path.join(dir, "recovery.json"));
    await fs.writeFile(path.join(root, "private.txt"), "PRIVATE");
    await fs.symlink(
      path.join(root, "private.txt"),
      path.join(dir, "recovery.json"),
    );
    await expect(
      reconcileHubArchive("asset-000", await proof(), signal()),
    ).rejects.toMatchObject({ status: 409 });
    expect(await fs.readFile(path.join(root, "private.txt"), "utf8")).toBe(
      "PRIVATE",
    );
    expect((await readHubArchive(signal())).records[0].recovery?.state).toBe(
      "unavailable",
    );
  });
});

test("reconciliation rejects cancelled/failed outcomes and supports cancellation and single-check admission", async () => {
  for (const state of ["cancelled", "failed"])
    await fixture(async (root) => {
      const dir = await create(root, state);
      await expect(
        reconcileHubArchive("asset-000", await proof(), signal()),
      ).rejects.toMatchObject({ status: 409 });
      await expect(fs.stat(path.join(dir, "recovery.json"))).rejects.toThrow();
    });
  await fixture(async (root) => {
    const dir = await create(root),
      identity = await proof(),
      cancelled = new AbortController();
    cancelled.abort();
    await expect(
      reconcileHubArchive("asset-000", identity, cancelled.signal),
    ).rejects.toMatchObject({ status: 499 });
    const one = reconcileHubArchive("asset-000", identity, signal());
    await expect(
      reconcileHubArchive("asset-000", identity, signal()),
    ).rejects.toMatchObject({ status: 429 });
    expect((await one).recovery?.state).toBe("saved");
    expect(await fs.readFile(path.join(dir, "model.gguf"))).toEqual(bytes);
  });
});

test("compiled API binds reconciliation to the inspected source and preserves the original receipt", async ({
  context,
}) => {
  await fixtureRole(context);
  const root = process.env.GW_SYNC_TEST_ROOT;
  if (!root) throw Error("Disposable test host required");
  const id = "asset-096",
    dir = path.join(root, "model-assets", id);
  await fs.mkdir(path.join(root, "model-assets"), { recursive: true });
  await fs.mkdir(dir);
  try {
    const original = JSON.stringify(receipt(id));
    await fs.writeFile(path.join(dir, "receipt.json"), original);
    await fs.writeFile(path.join(dir, "model.gguf"), bytes);
    const listed = await context.request.post("/api/sync/models/hub/archive", {
        data: { action: "list" },
      }),
      record = (await listed.json()).records.find((r: any) => r.slot === id);
    const data = {
      action: "reconcile",
      slot: id,
      receiptSha256: record.receiptSha256,
    };
    expect(
      (
        await context.request.post("/api/sync/models/hub/archive", {
          data: { ...data, receiptSha256: "f".repeat(64) },
        })
      ).status(),
    ).toBe(409);
    const response = await context.request.post(
      "/api/sync/models/hub/archive",
      { data },
    );
    expect(response.status()).toBe(200);
    expect((await response.json()).recovery.state).toBe("saved");
    expect(await fs.readFile(path.join(dir, "receipt.json"), "utf8")).toBe(
      original,
    );
    const again = await context.request.post("/api/sync/models/hub/archive", {
      data,
    });
    expect((await again.json()).recovery.state).toBe("already-recorded");
    expect(
      (
        await context.request.post("/api/sync/models/hub/archive", {
          data: { ...data, path: "other" },
        })
      ).status(),
    ).toBe(400);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("reconciliation keeps the usual controller/origin guards and requires a source receipt hash", async ({
  context,
}) => {
  const url = "/api/sync/models/hub/archive",
    data = {
      action: "reconcile",
      slot: "asset-000",
      receiptSha256: "a".repeat(64),
    };
  expect((await context.request.post(url, { data })).status()).toBe(401);
  await fixtureRole(context, "display");
  expect((await context.request.post(url, { data })).status()).toBe(403);
  await fixtureRole(context);
  expect(
    (
      await context.request.post(url, {
        data,
        headers: { Origin: "https://foreign.test" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await context.request.post(url, {
        data: { action: "reconcile", slot: "asset-000" },
      })
    ).status(),
  ).toBe(400);
});

test("desktop and phone explicitly reconcile uncertain published files and retain the original outcome", async ({
  page,
  context,
}, info) => {
  await fixtureRole(context);
  let calls = 0;
  const record = {
    slot: "asset-000",
    runId: randomUUID(),
    state: "publication-unconfirmed",
    repository: "owner/model",
    revision: "a".repeat(40),
    sourceFilename: "model.gguf",
    reportedLicense: "apache-2.0",
    recordedBytes: bytes.length,
    recordedSha256: digest,
    recordedAt: "2026-11-26T12:00:01.000Z",
    receiptSha256: "c".repeat(64),
    fileState: "size-matches-record",
    fileBytes: bytes.length,
    partialPresent: false,
    recovery: { state: "not-recorded" },
  };
  await page.route("**/api/sync/models/hub/archive", (route) => {
    const data = route.request().postDataJSON();
    if (data.action === "list")
      return route.fulfill({
        json: {
          state: "available",
          readAt: "2026-11-26T12:01:00.000Z",
          records: [record],
          validRecords: 1,
          withheldRecords: 0,
          occupiedSlots: 1,
          capacity: 100,
          pageLimit: 20,
          notice: "Historical outcomes only.",
        },
      });
    calls++;
    expect(data).toEqual({
      action: "reconcile",
      slot: "asset-000",
      receiptSha256: record.receiptSha256,
    });
    return route.fulfill({
      json: {
        verification: {
          slot: record.slot,
          runId: record.runId,
          checkedAt: "2026-11-26T12:01:01.000Z",
          recordedBytes: bytes.length,
          observedBytes: bytes.length,
          recordedSha256: digest,
          observedSha256: digest,
          receiptSha256: record.receiptSha256,
          state: "matches-record",
          runtimeImported: false,
          inferenceReady: false,
          notice: "Local recorded-byte comparison only.",
        },
        recovery: {
          recoveryId: "recovery-fixture",
          recordedAt: "2026-11-26T12:01:01.000Z",
          state: "saved",
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
  expect(calls).toBe(0);
  await page
    .getByRole("button", {
      name: "Reconcile published file · asset-000",
      exact: true,
    })
    .click();
  const result = page.getByRole("region", {
    name: "Archive reconciliation asset-000",
    exact: true,
  });
  await expect(result).toContainText("Separate recovery receipt saved");
  await expect(result).toContainText(
    "Original transfer outcome: Publication unconfirmed",
  );
  await expect(result).toContainText("no runtime import or activation");
  expect(calls).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await result.screenshot({
    path: `artifacts/hub-recovery/${info.project.name}.png`,
    animations: "disabled",
  });
});
