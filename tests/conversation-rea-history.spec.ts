import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { reaHistoryIntent } from "../lib/rea-history-intent";
import { conversationReaHistory } from "../lib/server/conversation-rea-history";
import { projectReaSelfTestRecord } from "../lib/server/rea-self-test-history";
import { POST } from "../app/api/sync/nexus/route";
import { token } from "../lib/server/sync-store";
import { fixtureRole } from "./helpers/access";
import { openAssistant } from "./helpers/assistant";
async function fixture(run: (config: any) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "local-model-catalog-"));
  const prior = process.env.GW_SYNC_DATA_DIR,
    model = process.env.GW_NEXUS_MODEL,
    original = globalThis.fetch;
  process.env.GW_SYNC_DATA_DIR = dir;
  process.env.GW_NEXUS_MODEL = "fixture";
  const config = {
    version: 1,
    pairingHash: "a".repeat(64),
    signingSecret: "b".repeat(64),
  };
  try {
    await fs.writeFile(
      path.join(dir, "sync-config.json"),
      JSON.stringify(config),
    );
    await run(config);
  } finally {
    globalThis.fetch = original;
    if (prior === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = prior;
    if (model === undefined) delete process.env.GW_NEXUS_MODEL;
    else process.env.GW_NEXUS_MODEL = model;
    await fs.rm(dir, { recursive: true, force: true });
  }
}

const sample = () => ({
  version: 1,
  kind: "owned-browser-fixture-self-test",
  runId: randomUUID(),
  state: "verified",
  startedAt: "2026-11-27T22:00:00.000Z",
  finishedAt: "2026-11-27T22:00:01.000Z",
  reaVersion: "6.10.1",
  nodeVersion: "v24.22.1",
  toolsCalled: 1,
  generalSiteInspectionReady: false,
  evidenceId: "ev_" + "a".repeat(64),
  evidenceSha256: "b".repeat(64),
  completeness: "policy_filtered",
  rawPage: "PRIVATE_PAGE",
  arbitraryPath: "PRIVATE_PATH",
});
test("saved REA wording never becomes an implicit browser test", () => {
  expect(reaHistoryIntent("Nexus, please show my saved REA tests.")).toBe(
    "history",
  );
  expect(reaHistoryIntent("List saved REA test history")).toBe("history");
  expect(reaHistoryIntent("Show saved REA tests and run them")).toBe("help");
  expect(reaHistoryIntent("Don't show saved REA tests")).toBeNull();
  expect(reaHistoryIntent("Inspect example.test with REA")).toBeNull();
});
test("historical REA projection preserves receipts and missing/unsafe stores without network effects", () =>
  fixture(async () => {
    let calls = 0;
    global.fetch = async () => {
      calls++;
      throw Error("No network allowed");
    };
    const signal = new AbortController().signal;
    const missing = await conversationReaHistory("history", signal);
    expect("reaHistory" in missing && missing.reaHistory.state).toBe(
      "not-created",
    );
    const dir = path.join(
      process.env.GW_SYNC_DATA_DIR!,
      "rea-self-test-receipts",
    );
    await expect(fs.access(dir)).rejects.toThrow();
    await fs.mkdir(dir);
    const values = [
      sample(),
      { ...sample(), state: "cancelled" },
      { ...sample(), state: "failed-or-unconfirmed" },
    ];
    for (let i = 0; i < values.length; i++)
      await fs.writeFile(
        path.join(dir, `${i}.json`),
        JSON.stringify(values[i]),
        { flag: "wx" },
      );
    await fs.writeFile(path.join(dir, "99.json"), "bad receipt", {
      flag: "wx",
    });
    const before = await fs.readFile(path.join(dir, "0.json"));
    const result = await conversationReaHistory("history", signal);
    expect("reaHistory" in result && result.reaHistory).toMatchObject({
      state: "available",
      validRecords: 3,
      withheldRecords: 1,
      generalSiteInspectionReady: false,
    });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_PAGE|PRIVATE_PATH/);
    expect(result.answer).toContain(
      "General website inspection remains unconnected",
    );
    expect(result).toMatchObject({
      resetHistory: true,
      clearRecordReferences: true,
      routing: { selected: [] },
    });
    expect(await fs.readFile(path.join(dir, "0.json"))).toEqual(before);
    expect(await fs.readFile(path.join(dir, "99.json"), "utf8")).toBe(
      "bad receipt",
    );
    await fs.rm(dir, { recursive: true });
    await fs.writeFile(dir, "unsafe layout", { flag: "wx" });
    expect((await conversationReaHistory("history", signal)).answer).toContain(
      "unavailable",
    );
    expect(await fs.readFile(dir, "utf8")).toBe("unsafe layout");
    await conversationReaHistory("help", signal);
    expect(calls).toBe(0);
  }));
test("REA conversation requires controller/origin/local mode and never falls through to a provider", () =>
  fixture(async (config) => {
    let calls = 0;
    global.fetch = async () => {
      calls++;
      throw Error("No provider allowed");
    };
    const send = (
      role: string | null = "controller",
      mode = "auto",
      origin = "http://localhost:3000",
    ) =>
      POST(
        new Request("http://localhost:3000/api/sync/nexus", {
          method: "POST",
          headers: {
            host: "localhost:3000",
            origin,
            "content-type": "application/json",
            ...(role
              ? { cookie: "gw_sync_session=" + token(config, role as any) }
              : {}),
          },
          body: JSON.stringify({
            query: "Show saved REA tests",
            mode,
            voiceConversation: true,
            allowExternal: true,
            publicQuery: "unused public terms",
          }),
        }),
      );
    expect((await send(null)).status).toBe(401);
    expect((await send("display")).status).toBe(403);
    expect(
      (await send("controller", "auto", "https://foreign.test")).status,
    ).toBe(403);
    for (const mode of ["knowledge", "compare", "openai"])
      expect((await send("controller", mode)).status).toBe(403);
    const good = await send();
    expect(good.status).toBe(200);
    expect((await good.json()).reaHistory.state).toBe("not-created");
    expect(calls).toBe(0);
  }));
test("compiled REA history command returns a projected owned receipt with no execution", async ({
  context,
}) => {
  await fixtureRole(context);
  const dir = path.join(
    process.env.GW_SYNC_TEST_ROOT!,
    "rea-self-test-receipts",
  );
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, "99.json"),
    value = sample();
  await fs.writeFile(file, JSON.stringify(value), { flag: "wx" });
  try {
    const response = await context.request.post("/api/sync/nexus", {
      data: {
        query: "Show saved REA tests",
        mode: "auto",
        voiceConversation: true,
      },
    });
    expect(response.status()).toBe(200);
    const result = await response.json();
    expect(
      result.reaHistory.records.some((r: any) => r.runId === value.runId),
    ).toBe(true);
    expect(result.reaHistory.generalSiteInspectionReady).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_PAGE|PRIVATE_PATH/);
  } finally {
    await fs.unlink(file);
  }
});
test("assistant shows historical REA states directly and keeps export/refresh explicit", async ({
  page,
  context,
}, info) => {
  await fixtureRole(context);
  let reads = 0;
  const values = [
    sample(),
    { ...sample(), state: "cancelled" },
    { ...sample(), state: "failed-or-unconfirmed" },
  ];
  const history = {
    state: "available",
    readAt: "2026-11-27T22:00:01.000Z",
    records: values.map(projectReaSelfTestRecord),
    validRecords: 3,
    withheldRecords: 0,
    occupiedSlots: 3,
    capacity: 100,
    pageLimit: 20,
    generalSiteInspectionReady: false,
    notice:
      "Historical owned-fixture outcomes only; general website inspection remains unconnected.",
  };
  await page.route("**/api/sync/agents", (route) => {
    if (route.request().method() === "POST") {
      reads++;
      return route.fulfill({
        status: 403,
        json: { error: "Controller required" },
      });
    }
    return route.fulfill({ json: { providers: [], events: [], workers: [] } });
  });
  await page.route("**/api/sync/nexus", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          json: {
            engine: "Nexus saved REA tests",
            sources: [],
            warnings: [],
            resetHistory: true,
            clearRecordReferences: true,
            answer: "Historical runs displayed; no browser started.",
            reaHistory: history,
          },
        })
      : route.fulfill({
          json: { sources: [], providers: [], sections: 0, localModel: false },
        }),
  );
  await page.goto("/nexus");
  await openAssistant(page);
  const drawer = page.getByRole("complementary", {
    name: "Nexus personal assistant",
    exact: true,
  });
  await drawer
    .getByRole("textbox", { name: "Ask Nexus", exact: true })
    .fill("Show saved REA tests");
  await drawer.getByRole("button", { name: "Ask Nexus", exact: true }).click();
  const region = drawer.getByRole("region", {
    name: "REA test history results",
    exact: true,
  });
  for (const text of [
    "Verified owned-fixture run",
    "Cancelled run",
    "Failed or unconfirmed run",
  ])
    await expect(region).toContainText(text);
  expect(reads).toBe(0);
  const event = page.waitForEvent("download");
  await drawer
    .getByRole("button", { name: "Download visible test history", exact: true })
    .click();
  const download = await event;
  expect(download.suggestedFilename()).toBe("nexus-rea-test-history.json");
  const exported = JSON.parse(
    await fs.readFile((await download.path())!, "utf8"),
  );
  expect(exported.records).toHaveLength(3);
  expect(JSON.stringify(exported)).not.toMatch(/PRIVATE_PAGE|PRIVATE_PATH/);
  expect(reads).toBe(0);
  expect(
    await region.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await fs.mkdir("artifacts/conversation-rea-history", { recursive: true });
  await region
    .locator("article")
    .first()
    .screenshot({
      path: `artifacts/conversation-rea-history/${info.project.name}.png`,
    });
  await drawer
    .getByRole("button", { name: "View saved REA test history", exact: true })
    .click();
  await expect(drawer).toContainText("Controller required");
  await expect(region).toHaveCount(0);
  expect(reads).toBe(1);
});
