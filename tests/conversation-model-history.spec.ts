import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { localModelIntent } from "../lib/local-model-intent";
import { conversationLocalModels } from "../lib/server/conversation-local-models";
import { saveLocalModelCheck } from "../lib/server/local-model-check-history";
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

const record = () => ({
  runId: randomUUID(),
  model: "private-project:latest",
  reportedModel: "private-project",
  digest: "a".repeat(64),
  checkedAt: "2026-11-27T22:00:00.000Z",
  elapsedMs: 100,
  state: "passed" as const,
  reportedOutputTokens: 3,
  notice: "PRIVATE_NOTICE",
});
test("saved-check wording stays separate from running checks or inspecting current models", () => {
  for (const text of [
    "Show saved local model checks",
    "Nexus, please list my saved model diagnostics.",
  ])
    expect(localModelIntent(text)).toBe("history");
  expect(localModelIntent("Show saved local model checks and run them")).toBe(
    "help",
  );
  expect(localModelIntent("Don't show saved local model checks")).toBeNull();
});
test("conversation history preserves missing/corrupt stores, projects saved results and never contacts a runtime", () =>
  fixture(async () => {
    let calls = 0;
    global.fetch = async () => {
      calls++;
      throw Error("No runtime request allowed");
    };
    const signal = new AbortController().signal;
    const missing = await conversationLocalModels("history", signal);
    expect(
      "localModelHistory" in missing && missing.localModelHistory.state,
    ).toBe("not-created");
    const dir = path.join(
      process.env.GW_SYNC_DATA_DIR!,
      "local-model-check-receipts",
    );
    await expect(fs.access(dir)).rejects.toThrow();
    const value = record();
    expect(await saveLocalModelCheck(value)).toBe("saved");
    await fs.writeFile(path.join(dir, "99.json"), "malformed", { flag: "wx" });
    const result = await conversationLocalModels("history", signal);
    expect(
      "localModelHistory" in result && result.localModelHistory,
    ).toMatchObject({
      state: "available",
      validRecords: 1,
      withheldRecords: 1,
      records: [{ runId: value.runId }],
    });
    expect(result.answer).toContain("historical");
    expect(result.answer).not.toContain("private-project");
    expect(JSON.stringify(result)).not.toContain("PRIVATE_NOTICE");
    expect(result).toMatchObject({
      resetHistory: true,
      clearRecordReferences: true,
      routing: { selected: [] },
    });
    expect(await fs.readFile(path.join(dir, "99.json"), "utf8")).toBe(
      "malformed",
    );
    await fs.rm(dir, { recursive: true });
    await fs.writeFile(dir, "unsafe layout", { flag: "wx" });
    const unavailable = await conversationLocalModels("history", signal);
    expect(unavailable.answer).toContain("unavailable");
    expect(await fs.readFile(dir, "utf8")).toBe("unsafe layout");
    expect(calls).toBe(0);
  }));
test("history conversation requires controller/origin/local mode even with external-sharing flags", () =>
  fixture(async (config) => {
    let calls = 0;
    global.fetch = async () => {
      calls++;
      throw Error("No runtime or provider allowed");
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
            query: "Show saved local model checks",
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
    const result = await send();
    expect(result.status).toBe(200);
    expect((await result.json()).localModelHistory.state).toBe("not-created");
    expect(calls).toBe(0);
  }));
test("compiled conversational history reads an owned saved receipt without a runtime", async ({
  context,
}) => {
  await fixtureRole(context);
  const dir = path.join(
    process.env.GW_SYNC_TEST_ROOT!,
    "local-model-check-receipts",
  );
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, "99.json"),
    value = record();
  await fs.writeFile(
    file,
    JSON.stringify({ version: 1, kind: "fixed-local-model-check", ...value }),
    { flag: "wx" },
  );
  try {
    const response = await context.request.post("/api/sync/nexus", {
      data: {
        query: "Show saved local model checks",
        mode: "auto",
        voiceConversation: true,
      },
    });
    expect(response.status()).toBe(200);
    const result = await response.json();
    expect(
      result.localModelHistory.records.some(
        (r: any) => r.runId === value.runId,
      ),
    ).toBe(true);
    expect(result.answer).not.toContain(value.model);
    expect(JSON.stringify(result)).not.toContain("PRIVATE_NOTICE");
  } finally {
    await fs.unlink(file);
  }
});
test("assistant reuses saved history, keeps export explicit and does not run a model on desktop or phone", async ({
  page,
  context,
}, info) => {
  await fixtureRole(context);
  let reads = 0;
  const value = record();
  const history = {
    state: "available",
    readAt: "2026-11-27T22:00:00.000Z",
    records: [value],
    validRecords: 1,
    withheldRecords: 0,
    occupiedSlots: 1,
    capacity: 100,
    pageLimit: 20,
    notice: "Saved history only; no runtime requested.",
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
            engine: "Nexus saved model diagnostics",
            sources: [],
            warnings: [],
            resetHistory: true,
            clearRecordReferences: true,
            answer:
              "One historical check is displayed. No inference test was started.",
            localModelHistory: history,
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
    .fill("Show saved local model checks");
  await drawer.getByRole("button", { name: "Ask Nexus", exact: true }).click();
  const region = drawer.getByRole("region", {
    name: "Saved model diagnostic results",
    exact: true,
  });
  await expect(region).toContainText("Historical fixed test passed");
  await expect(region).toContainText("does not establish");
  expect(reads).toBe(0);
  const downloadEvent = page.waitForEvent("download");
  await drawer
    .getByRole("button", {
      name: "Download saved model diagnostics",
      exact: true,
    })
    .click();
  const download = await downloadEvent;
  const exported = JSON.parse(
    await fs.readFile((await download.path())!, "utf8"),
  );
  expect(exported.records[0].runId).toBe(value.runId);
  expect(reads).toBe(0);
  expect(
    await region.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await fs.mkdir("artifacts/conversation-model-history", { recursive: true });
  await region.screenshot({
    path: `artifacts/conversation-model-history/${info.project.name}.png`,
  });
  await drawer
    .getByRole("button", { name: "Read saved model diagnostics", exact: true })
    .click();
  await expect(drawer).toContainText("Controller required");
  await expect(region).toHaveCount(0);
  expect(reads).toBe(1);
});
