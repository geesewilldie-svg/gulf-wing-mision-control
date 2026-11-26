import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID, createHash } from "node:crypto";
import {
  readHubArchive,
  verifyHubArchive,
  projectArchiveRecord,
} from "../lib/server/hub-archive-history";
import { fixtureRole } from "./helpers/access";
const bytes = Buffer.from("GGUF archive history fixture"),
  hash = createHash("sha256").update(bytes).digest("hex");
function receipt(slot = "asset-000", state = "verified") {
  return {
    version: 1,
    kind: "hub-model-archive",
    runId: randomUUID(),
    state,
    startedAt: "2026-11-26T12:00:00.000Z",
    finishedAt: "2026-11-26T12:00:01.000Z",
    verifiedAt: "2026-11-26T12:00:01.000Z",
    repository: "owner/model",
    revision: "a".repeat(40),
    sourceFilename: "model.gguf",
    reportedLicense: "apache-2.0",
    expectedBytes: bytes.length,
    expectedSha256: hash,
    archiveFile: slot + "/model.gguf",
    licenseReviewed: true,
    archiveOnly: true,
    runtimeImported: false,
    inferenceReady: false,
    bytes: bytes.length,
    sha256: hash,
    receiptState: "saved",
    downloaded: true,
  };
}
async function fixture(run: (root: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "archive-history-")),
    previous = process.env.GW_SYNC_DATA_DIR,
    transport = global.fetch;
  process.env.GW_SYNC_DATA_DIR = root;
  global.fetch = async () => {
    throw Error("No provider request is permitted");
  };
  try {
    await run(root);
  } finally {
    global.fetch = transport;
    if (previous === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = previous;
    await fs.rm(root, { recursive: true, force: true });
  }
}
async function slot(root: string, id = "asset-000", data = receipt(id)) {
  const dir = path.join(root, "model-assets", id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "receipt.json"), JSON.stringify(data));
  await fs.writeFile(path.join(dir, "model.gguf"), bytes);
  return dir;
}
const signal = () => new AbortController().signal;

test("archive inspection preserves files and reports current sizes separately from recorded verification", async () => {
  await fixture(async (root) => {
    expect((await readHubArchive(signal())).state).toBe("not-created");
    expect(await fs.readdir(root)).toEqual([]);
    const dir = await slot(root),
      before = await fs.stat(path.join(dir, "model.gguf")),
      source = await fs.readFile(path.join(dir, "receipt.json"));
    const history = await readHubArchive(signal());
    expect(history.records[0].state).toBe("verified");
    expect(history.records[0].fileState).toBe("size-matches-record");
    expect(history.records[0].partialPresent).toBe(false);
    const verified = await verifyHubArchive("asset-000", signal());
    expect(verified.state).toBe("matches-record");
    expect(verified.observedSha256).toBe(hash);
    expect(verified.inferenceReady).toBe(false);
    expect(await fs.readFile(path.join(dir, "model.gguf"))).toEqual(bytes);
    expect((await fs.stat(path.join(dir, "model.gguf"))).mtimeMs).toBe(
      before.mtimeMs,
    );
    expect(await fs.readFile(path.join(dir, "receipt.json"))).toEqual(source);
  });
});

test("same-size edits require a hash check; changed-size, missing and unsafe files never become verified results", async () => {
  await fixture(async (root) => {
    const dir = await slot(root),
      name = path.join(dir, "model.gguf");
    const changed = Buffer.from(bytes);
    changed[4] ^= 1;
    await fs.writeFile(name, changed);
    expect((await readHubArchive(signal())).records[0].fileState).toBe(
      "size-matches-record",
    );
    expect((await verifyHubArchive("asset-000", signal())).state).toBe(
      "mismatch",
    );
    await fs.writeFile(name, "short");
    expect((await readHubArchive(signal())).records[0].fileState).toBe(
      "size-mismatch",
    );
    expect(
      (await verifyHubArchive("asset-000", signal())).observedSha256,
    ).toBeNull();
    await fs.unlink(name);
    expect((await readHubArchive(signal())).records[0].fileState).toBe(
      "missing",
    );
    await expect(verifyHubArchive("asset-000", signal())).rejects.toThrow();
    await fs.writeFile(path.join(root, "private.txt"), "PRIVATE");
    await fs.symlink(path.join(root, "private.txt"), name);
    expect((await readHubArchive(signal())).records[0].fileState).toBe(
      "unsafe-or-unavailable",
    );
    await expect(verifyHubArchive("asset-000", signal())).rejects.toThrow();
  });
});

test("unfinished, cancelled, failed and uncertain receipts stay distinct and cannot be promoted by rechecking", async () => {
  await fixture(async (root) => {
    for (const [i, state] of [
      "started",
      "cancelled",
      "failed",
      "publication-unconfirmed",
    ].entries()) {
      const name = "asset-" + String(i).padStart(3, "0"),
        dir = await slot(root, name, receipt(name, state));
      await fs.writeFile(path.join(dir, "model.partial"), "partial");
      await expect(verifyHubArchive(name, signal())).rejects.toMatchObject({
        status: 409,
      });
    }
    const result = await readHubArchive(signal());
    expect(result.validRecords).toBe(4);
    expect(result.records.every((r) => r.partialPresent === true)).toBe(true);
    expect(result.records.map((r) => r.state).sort()).toEqual([
      "cancelled",
      "failed",
      "publication-unconfirmed",
      "started",
    ]);
  });
});

test("fixed-slot coverage withholds invalid, oversized and symlink records, and projects no raw paths or unexpected fields", async () => {
  await fixture(async (root) => {
    for (let i = 0; i < 22; i++) {
      const name = "asset-" + String(i).padStart(3, "0");
      await slot(root, name, {
        ...receipt(name),
        verifiedAt: `2026-11-26T12:00:${String(i + 1).padStart(2, "0")}.000Z`,
        extra: "PRIVATE",
      } as any);
    }
    for (const [i, body] of [
      [22, "broken"],
      [23, "x".repeat(8001)],
    ] as const) {
      const dir = path.join(root, "model-assets", "asset-0" + i);
      await fs.mkdir(dir);
      await fs.writeFile(path.join(dir, "receipt.json"), body);
    }
    await fs.symlink(
      path.join(root, "model-assets", "asset-000"),
      path.join(root, "model-assets", "asset-024"),
      "dir",
    );
    const result = await readHubArchive(signal());
    expect(result.validRecords).toBe(22);
    expect(result.records.length).toBe(20);
    expect(result.records[0].slot).toBe("asset-021");
    expect(result.occupiedSlots).toBe(25);
    expect(result.withheldRecords).toBe(3);
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(JSON.stringify(result)).not.toContain(root);
    expect(
      projectArchiveRecord(
        { ...receipt(), archiveFile: "../../private" },
        "asset-000",
      ),
    ).toBeNull();
    expect(
      projectArchiveRecord({ ...receipt(), inferenceReady: true }, "asset-000"),
    ).toBeNull();
  });
});

test("cancelled file checks and caller paths do not yield a verified result", async () => {
  const cancelled = new AbortController();
  cancelled.abort();
  await expect(
    verifyHubArchive("asset-000", cancelled.signal),
  ).rejects.toMatchObject({ status: 499 });
  await expect(verifyHubArchive("../private", signal())).rejects.toMatchObject({
    status: 400,
  });
});

test("archive API enforces controller and origin and supports only list or exact-slot verification", async ({
  context,
}) => {
  const url = "/api/sync/models/hub/archive",
    data = { action: "list" };
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
  for (const body of [
    { action: "list", path: "private" },
    { action: "verify", slot: "../private" },
    { action: "delete", slot: "asset-000" },
  ])
    expect((await context.request.post(url, { data: body })).status()).toBe(
      400,
    );
  expect((await context.request.post(url, { data })).status()).toBe(200);
});

test("desktop and phone distinguish historical and current checks, export records, and clear results after denial", async ({
  page,
  context,
}, info) => {
  await fixtureRole(context);
  let calls = 0,
    deny = false;
  let changedRun = false;
  const record = {
    ...projectArchiveRecord(receipt(), "asset-000")!,
    fileState: "size-matches-record",
    fileBytes: bytes.length,
    partialPresent: false,
  };
  await page.route("**/api/sync/models/hub/archive", (route) => {
    calls++;
    const body = route.request().postDataJSON();
    if (deny)
      return route.fulfill({
        status: 403,
        json: { error: "Controller access required" },
      });
    if (body.action === "list") {
      expect(body).toEqual({ action: "list" });
      return route.fulfill({
        json: {
          state: "available",
          readAt: "2026-11-26T12:01:00.000Z",
          records: [record],
          validRecords: 1,
          withheldRecords: 1,
          occupiedSlots: 2,
          capacity: 100,
          pageLimit: 20,
          notice:
            "Recorded outcomes and current size metadata only. No weights were read.",
        },
      });
    }
    expect(body).toEqual({ action: "verify", slot: "asset-000" });
    return route.fulfill({
      json: {
        slot: "asset-000",
        runId: changedRun ? "different-run" : record.runId,
        checkedAt: "2026-11-26T12:01:01.000Z",
        state: "matches-record",
        recordedBytes: bytes.length,
        observedBytes: bytes.length,
        recordedSha256: hash,
        observedSha256: hash,
        runtimeImported: false,
        inferenceReady: false,
        notice:
          "Read-only comparison against local recorded bytes. No source request or import.",
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
  expect(calls).toBe(0);
  await page
    .getByRole("button", { name: "Inspect local model archive", exact: true })
    .click();
  const list = page.getByRole("region", {
    name: "Local model archive records",
    exact: true,
  });
  await expect(list).toContainText("Recorded verified transfer");
  await expect(list).toContainText("hash not checked");
  await page
    .getByRole("button", {
      name: "Check current file · asset-000",
      exact: true,
    })
    .click();
  const checked = page.getByRole("region", {
    name: "Archive file check asset-000",
    exact: true,
  });
  await expect(checked).toContainText(
    "Current file matches recorded size/hash",
  );
  await expect(checked).toContainText("Inference readiness remains unverified");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await list.screenshot({
    path: `artifacts/hub-archive-history/${info.project.name}.png`,
    animations: "disabled",
  });
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download visible archive records" })
    .click();
  expect((await download).suggestedFilename()).toBe(
    "nexus-model-archive-history.json",
  );
  changedRun = true;
  await page
    .getByRole("button", {
      name: "Check current file · asset-000",
      exact: true,
    })
    .click();
  await expect(
    page.getByText(
      "The archive record changed. Inspect the archive again before accepting a file check.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(list).toHaveCount(0);
  changedRun = false;
  await page
    .getByRole("button", { name: "Inspect local model archive", exact: true })
    .click();
  await expect(list).toBeVisible();
  deny = true;
  await page
    .getByRole("button", { name: "Inspect local model archive", exact: true })
    .click();
  await expect(
    page.getByText("Controller access required", { exact: true }),
  ).toBeVisible();
  await expect(list).toHaveCount(0);
  await expect(checked).toHaveCount(0);
  expect(calls).toBe(5);
});

test("compiled archive API lists and rehashes a real disposable file without any source lookup", async ({
  context,
}) => {
  await fixtureRole(context);
  const root = process.env.GW_SYNC_TEST_ROOT;
  if (!root) throw Error("Disposable host configuration required");
  const id = "asset-097",
    dir = path.join(root, "model-assets", id);
  await fs.mkdir(path.join(root, "model-assets"), { recursive: true });
  await fs.mkdir(dir);
  try {
    await fs.writeFile(
      path.join(dir, "receipt.json"),
      JSON.stringify(receipt(id)),
    );
    await fs.writeFile(path.join(dir, "model.gguf"), bytes);
    const listed = await context.request.post("/api/sync/models/hub/archive", {
      data: { action: "list" },
    });
    expect(listed.status()).toBe(200);
    expect(
      (await listed.json()).records.some(
        (r: any) => r.slot === id && r.fileState === "size-matches-record",
      ),
    ).toBe(true);
    const checked = await context.request.post("/api/sync/models/hub/archive", {
      data: { action: "verify", slot: id },
    });
    expect(checked.status()).toBe(200);
    expect((await checked.json()).state).toBe("matches-record");
    const changed = Buffer.from(bytes);
    changed[4] ^= 1;
    await fs.writeFile(path.join(dir, "model.gguf"), changed);
    const mismatch = await context.request.post(
      "/api/sync/models/hub/archive",
      { data: { action: "verify", slot: id } },
    );
    expect(mismatch.status()).toBe(200);
    expect((await mismatch.json()).state).toBe("mismatch");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
