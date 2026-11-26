import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import {
  readReaSelfTestHistory,
  projectReaSelfTestRecord,
} from "../lib/server/rea-self-test-history";
import { writeReaSelfTestReceipt } from "../lib/server/rea-browser-self-test";
import { fixtureRole } from "./helpers/access";

const sample = () => ({
  version: 1,
  kind: "owned-browser-fixture-self-test",
  runId: randomUUID(),
  state: "verified",
  startedAt: "2026-11-26T12:00:00.000Z",
  finishedAt: "2026-11-26T12:00:01.000Z",
  reaVersion: "6.10.1",
  nodeVersion: "v24.22.1",
  evidenceId: "ev_" + "a".repeat(64),
  evidenceSha256: "b".repeat(64),
  completeness: "policy_filtered",
  toolsCalled: 1,
  generalSiteInspectionReady: false,
});
async function privateRoot(run: (root: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "rea-history-")),
    previous = process.env.GW_SYNC_DATA_DIR;
  process.env.GW_SYNC_DATA_DIR = root;
  try {
    await run(root);
  } finally {
    if (previous === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = previous;
    await fs.rm(root, { recursive: true, force: true });
  }
}
const signal = () => new AbortController().signal;

test("saved receipts survive a read without changing bytes or triggering a test; unknown payload is not exposed", async () => {
  await privateRoot(async (root) => {
    expect((await readReaSelfTestHistory(signal())).state).toBe("not-created");
    expect(await fs.readdir(root)).toEqual([]);
    const good = sample();
    expect(
      await writeReaSelfTestReceipt({
        ...good,
        rawPage: "PRIVATE PAGE",
        arbitraryPath: "PRIVATE PATH",
      }),
    ).toBe("saved");
    const file = path.join(root, "rea-self-test-receipts", "0.json"),
      before = await fs.stat(file),
      bytes = await fs.readFile(file);
    const history = await readReaSelfTestHistory(signal());
    expect(history.state).toBe("available");
    expect(history.records).toEqual([projectReaSelfTestRecord(good)]);
    expect(history.generalSiteInspectionReady).toBe(false);
    expect(JSON.stringify(history)).not.toContain("PRIVATE");
    expect(await fs.readFile(file)).toEqual(bytes);
    expect((await fs.stat(file)).mtimeMs).toBe(before.mtimeMs);
    expect(history.occupiedSlots).toBe(1);
  });
});

test("history shows newest 20 valid numbered receipts and reports malformed/oversized/symlink slots without reading arbitrary files", async () => {
  await privateRoot(async (root) => {
    const dir = path.join(root, "rea-self-test-receipts");
    await fs.mkdir(dir);
    for (let i = 0; i < 23; i++)
      await fs.writeFile(
        path.join(dir, i + ".json"),
        JSON.stringify({
          ...sample(),
          finishedAt: `2026-11-26T12:00:${String(i + 1).padStart(2, "0")}.000Z`,
        }),
      );
    await fs.writeFile(path.join(dir, "23.json"), "broken");
    await fs.writeFile(path.join(dir, "24.json"), "x".repeat(8001));
    await fs.writeFile(path.join(root, "private.txt"), "SECRET");
    await fs.symlink(path.join(root, "private.txt"), path.join(dir, "25.json"));
    await fs.writeFile(path.join(dir, "999.json"), "not a slot");
    const result = await readReaSelfTestHistory(signal());
    expect(result.validRecords).toBe(23);
    expect(result.records.length).toBe(20);
    expect(result.withheldRecords).toBe(3);
    expect(result.occupiedSlots).toBe(26);
    expect(result.records[0].finishedAt).toBe("2026-11-26T12:00:23.000Z");
    expect(result.records[19].finishedAt).toBe("2026-11-26T12:00:04.000Z");
    expect(JSON.stringify(result)).not.toContain("SECRET");
    await fs.rename(dir, path.join(root, "retained"));
    await fs.symlink(path.join(root, "retained"), dir, "dir");
    expect((await readReaSelfTestHistory(signal())).state).toBe("unavailable");
  });
});

test("receipt schema rejects false readiness, invalid provenance and reversed times; failures stay historical failures", () => {
  for (const change of [
    { toolsCalled: 0 },
    { generalSiteInspectionReady: true },
    { evidenceId: "fake" },
    { evidenceSha256: "fake" },
    { runId: "bad" },
    { nodeVersion: "bad" },
    { completeness: "<script>" },
    { finishedAt: "2026-11-25T12:00:00.000Z" },
  ])
    expect(projectReaSelfTestRecord({ ...sample(), ...change })).toBeNull();
  const failed = {
    ...sample(),
    state: "failed-or-unconfirmed",
    evidenceId: "secret",
    nodeVersion: "secret",
  };
  const projected = projectReaSelfTestRecord(failed)!;
  expect(projected.state).toBe("failed-or-unconfirmed");
  expect(projected.evidenceId).toBeUndefined();
  expect(projected.nodeVersion).toBeUndefined();
});

test("cancelled reads do not expose partial history", async () => {
  const cancelled = new AbortController();
  cancelled.abort();
  await expect(readReaSelfTestHistory(cancelled.signal)).rejects.toThrow();
});

test("history API enforces controller, origin and no caller paths; missing history is read-only", async ({
  context,
}) => {
  const data = { action: "rea-test-history" };
  expect(
    (await context.request.post("/api/sync/agents", { data })).status(),
  ).toBe(401);
  await fixtureRole(context, "display");
  expect(
    (await context.request.post("/api/sync/agents", { data })).status(),
  ).toBe(403);
  await fixtureRole(context);
  expect(
    (
      await context.request.post("/api/sync/agents", {
        data,
        headers: { Origin: "https://foreign.test" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await context.request.post("/api/sync/agents", {
        data: { ...data, path: "arbitrary" },
      })
    ).status(),
  ).toBe(400);
  const response = await context.request.post("/api/sync/agents", { data });
  expect(response.status()).toBe(200);
  expect((await response.json()).generalSiteInspectionReady).toBe(false);
});

test("saved run history is explicit, downloadable, phone friendly and cleared after denial", async ({
  page,
  context,
}, info) => {
  await fixtureRole(context);
  let calls = 0,
    deny = false;
  const record = projectReaSelfTestRecord(sample());
  await page.route("**/api/sync/agents", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { providers: [], events: [] } });
    expect(route.request().postDataJSON()).toEqual({
      action: "rea-test-history",
    });
    calls++;
    if (deny)
      return route.fulfill({
        status: 403,
        json: { error: "Controller access required" },
      });
    return route.fulfill({
      json: {
        state: "available",
        readAt: "2026-11-26T12:01:00.000Z",
        records: [record],
        validRecords: 1,
        withheldRecords: 2,
        occupiedSlots: 100,
        capacity: 100,
        pageLimit: 20,
        generalSiteInspectionReady: false,
        notice:
          "Historical local test receipts only. No process or browser was started.",
      },
    });
  });
  await page.goto("/nexus");
  await page.getByText("Connection activity", { exact: true }).click();
  await page.getByText("REA inspection prerequisites", { exact: true }).click();
  expect(calls).toBe(0);
  await page
    .getByRole("button", { name: "View saved REA test history", exact: true })
    .click();
  const result = page.getByRole("region", {
    name: "REA test history results",
    exact: true,
  });
  await expect(result).toContainText("Verified owned-fixture run");
  await expect(result).toContainText("Receipt storage is full");
  await expect(result).toContainText(
    "2 unreadable, invalid or duplicate records withheld",
  );
  await page
    .getByText("Evidence identity for this run", { exact: true })
    .click();
  await expect(result).toContainText(record!.evidenceSha256!);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download visible test history" })
    .click();
  expect((await download).suggestedFilename()).toBe(
    "nexus-rea-test-history.json",
  );
  await page
    .getByRole("region", { name: "Saved REA test history", exact: true })
    .screenshot({
      path: `artifacts/rea-history/${info.project.name}.png`,
      animations: "disabled",
    });
  deny = true;
  await page
    .getByRole("button", { name: "View saved REA test history", exact: true })
    .click();
  await expect(
    page.getByText("Controller access required", { exact: true }),
  ).toBeVisible();
  await expect(result).toHaveCount(0);
  expect(calls).toBe(2);
});
