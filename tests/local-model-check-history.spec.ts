import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  readLocalModelCheckHistory,
  saveLocalModelCheck,
  projectLocalModelCheckRecord,
} from "../lib/server/local-model-check-history";
import { checkLocalModel } from "../lib/server/local-model-check";
import { POST } from "../app/api/sync/agents/route";
import { token } from "../lib/server/sync-store";
import { fixtureRole, fixtureCookieHeader } from "./helpers/access";
import type { LocalModelCheck } from "../lib/local-model-check";
const signal = () => new AbortController().signal;
const record = (
  state: LocalModelCheck["state"] = "passed",
): LocalModelCheck => ({
  runId: randomUUID(),
  model: "fixture:latest",
  reportedModel: "fixture",
  digest: "a".repeat(64),
  checkedAt: "2026-11-27T12:00:00.000Z",
  elapsedMs: 1200,
  state,
  reportedOutputTokens: 5,
  notice: "PRIVATE RAW NOTICE",
});
async function fixture(run: (root: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "diagnostic-history-"));
  const prev = process.env.GW_SYNC_DATA_DIR,
    model = process.env.GW_NEXUS_MODEL,
    transport = global.fetch;
  process.env.GW_SYNC_DATA_DIR = root;
  process.env.GW_NEXUS_MODEL = "fixture";
  try {
    await run(root);
  } finally {
    global.fetch = transport;
    if (prev === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = prev;
    if (model === undefined) delete process.env.GW_NEXUS_MODEL;
    else process.env.GW_NEXUS_MODEL = model;
    await fs.rm(root, { recursive: true, force: true });
  }
}
test("completed diagnostics persist only projected metadata and survive a later runtime failure", () =>
  fixture(async (root) => {
    let calls = 0,
      fail = false;
    global.fetch = async (url) => {
      calls++;
      if (fail) throw Error("runtime offline");
      return Response.json(
        String(url).endsWith("/tags")
          ? { models: [{ name: "fixture:latest", digest: "a".repeat(64) }] }
          : String(url).endsWith("/show")
            ? { capabilities: ["completion"] }
            : {
                done: true,
                model: "fixture",
                response: "NEXUS_OK",
                eval_count: 5,
                thinking: "PRIVATE THINKING",
                context: [123],
              },
      );
    };
    const input = {
      action: "local-model-check",
      model: "fixture:latest",
      digest: "a".repeat(64),
      runTest: true,
    };
    const completed = await checkLocalModel(input, signal());
    expect(completed.receiptState).toBe("saved");
    const file = path.join(root, "local-model-check-receipts", "0.json"),
      before = await fs.readFile(file, "utf8"),
      stat = await fs.stat(file);
    expect(before).not.toMatch(/PRIVATE|context|thinking|notice|response"/);
    fail = true;
    await expect(checkLocalModel(input, signal())).rejects.toThrow();
    const count = calls,
      history = await readLocalModelCheckHistory(signal());
    expect(calls).toBe(count);
    expect(history.records).toHaveLength(1);
    expect(history.records[0].runId).toBe(completed.runId);
    expect(await fs.readFile(file, "utf8")).toBe(before);
    expect((await fs.stat(file)).mtimeMs).toBe(stat.mtimeMs);
  }));
test("missing store is read-only and cancellation does not create a store", () =>
  fixture(async (root) => {
    global.fetch = async () => {
      throw Error("No runtime calls");
    };
    expect((await readLocalModelCheckHistory(signal())).state).toBe(
      "not-created",
    );
    const controller = new AbortController();
    controller.abort();
    await expect(
      readLocalModelCheckHistory(controller.signal),
    ).rejects.toThrow();
    expect(await fs.readdir(root)).toEqual([]);
  }));
test("exclusive slots preserve earlier outcomes, return twenty newest and report full capacity without overwrite", () =>
  fixture(async (root) => {
    const first = record();
    expect(await saveLocalModelCheck(first)).toBe("saved");
    const file = path.join(root, "local-model-check-receipts", "0.json"),
      bytes = await fs.readFile(file),
      stat = await fs.stat(file);
    for (let i = 1; i < 100; i++)
      expect(
        await saveLocalModelCheck({
          ...record(i % 2 ? "unexpected-response" : "passed"),
          checkedAt: new Date(
            Date.parse(first.checkedAt) + i * 1000,
          ).toISOString(),
        }),
      ).toBe("saved");
    expect(await saveLocalModelCheck(record())).toBe("pending");
    const history = await readLocalModelCheckHistory(signal());
    expect(history).toMatchObject({
      validRecords: 100,
      occupiedSlots: 100,
      withheldRecords: 0,
    });
    expect(history.records).toHaveLength(20);
    expect(history.records[0].checkedAt).toBe("2026-11-27T12:01:39.000Z");
    expect(await fs.readFile(file)).toEqual(bytes);
    expect((await fs.stat(file)).mtimeMs).toBe(stat.mtimeMs);
  }));
test("unsafe, malformed, oversized and duplicate records are withheld with bounded known-field projection", () =>
  fixture(async (root) => {
    const value = record();
    await saveLocalModelCheck(value);
    const dir = path.join(root, "local-model-check-receipts"),
      raw = JSON.parse(await fs.readFile(path.join(dir, "0.json"), "utf8"));
    await fs.writeFile(
      path.join(dir, "0.json"),
      JSON.stringify({ ...raw, secrets: "PRIVATE" }),
    );
    await fs.writeFile(path.join(dir, "1.json"), JSON.stringify(raw));
    await fs.writeFile(path.join(dir, "2.json"), "bad json");
    await fs.writeFile(path.join(dir, "3.json"), "x".repeat(8001));
    await fs.symlink(path.join(dir, "0.json"), path.join(dir, "4.json"));
    await fs.mkdir(path.join(dir, "5.json"));
    const history = await readLocalModelCheckHistory(signal());
    expect(history).toMatchObject({
      occupiedSlots: 6,
      withheldRecords: 5,
      validRecords: 1,
    });
    expect(JSON.stringify(history)).not.toContain("PRIVATE");
    for (const mutation of [
      { model: "remote/cloud" },
      { reportedModel: "other" },
      { digest: "bad" },
      { checkedAt: "invalid" },
      { state: "cancelled" },
      { reportedOutputTokens: 9 },
      { elapsedMs: -1 },
    ])
      expect(projectLocalModelCheckRecord({ ...raw, ...mutation })).toBeNull();
  }));
test("foreign directory symlinks block saving and reading without touching the target", () =>
  fixture(async (root) => {
    const other = await fs.mkdtemp(path.join(os.tmpdir(), "history-foreign-"));
    try {
      await fs.symlink(other, path.join(root, "local-model-check-receipts"));
      expect(await saveLocalModelCheck(record())).toBe("pending");
      expect((await readLocalModelCheckHistory(signal())).state).toBe(
        "unavailable",
      );
      expect(await fs.readdir(other)).toEqual([]);
    } finally {
      await fs.rm(other, { recursive: true, force: true });
    }
  }));
test("a full or unsafe history store does not erase a completed diagnostic or cause another generation", () =>
  fixture(async (root) => {
    await fs.writeFile(
      path.join(root, "local-model-check-receipts"),
      "foreign data",
    );
    let generated = 0;
    global.fetch = async (url) => {
      if (String(url).endsWith("/generate")) generated++;
      return Response.json(
        String(url).endsWith("/tags")
          ? { models: [{ name: "fixture:latest", digest: "a".repeat(64) }] }
          : String(url).endsWith("/show")
            ? { capabilities: ["completion"] }
            : {
                done: true,
                model: "fixture",
                response: "different",
                eval_count: 3,
              },
      );
    };
    const result = await checkLocalModel(
      {
        action: "local-model-check",
        model: "fixture:latest",
        digest: "a".repeat(64),
        runTest: true,
      },
      signal(),
    );
    expect(result).toMatchObject({
      state: "unexpected-response",
      receiptState: "pending",
    });
    expect(generated).toBe(1);
    expect(
      await fs.readFile(path.join(root, "local-model-check-receipts"), "utf8"),
    ).toBe("foreign data");
  }));
test("history route rejects missing/display/foreign/extra-field requests and makes no runtime calls", () =>
  fixture(async (root) => {
    const config = {
      version: 1 as const,
      pairingHash: "a".repeat(64),
      signingSecret: "b".repeat(64),
    };
    await fs.writeFile(
      path.join(root, "sync-config.json"),
      JSON.stringify(config),
    );
    global.fetch = async () => {
      throw Error("Runtime must not be called");
    };
    const send = (
      role: "controller" | "display" | null,
      origin = "http://localhost:3000",
      extra = {},
    ) =>
      POST(
        new Request("http://localhost:3000/api/sync/agents", {
          method: "POST",
          headers: {
            host: "localhost:3000",
            origin,
            "content-type": "application/json",
            ...(role
              ? { cookie: "gw_sync_session=" + token(config, role) }
              : {}),
          },
          body: JSON.stringify({
            action: "local-model-check-history",
            ...extra,
          }),
        }),
      );
    expect((await send(null)).status).toBe(401);
    expect((await send("display")).status).toBe(403);
    expect((await send("controller", "https://foreign.invalid")).status).toBe(
      403,
    );
    expect(
      (await send("controller", undefined, { path: "/private" })).status,
    ).toBe(400);
    expect((await send("controller")).status).toBe(200);
  }));
test("compiled production history endpoint reads disposable saved metadata without a runtime", async ({
  request,
}) => {
  const root = process.env.GW_SYNC_TEST_ROOT!,
    dir = path.join(root, "local-model-check-receipts");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, "99.json"),
    value = record();
  await fs.writeFile(
    file,
    JSON.stringify({ version: 1, kind: "fixed-local-model-check", ...value }),
  );
  try {
    const response = await request.post("/api/sync/agents", {
      headers: {
        origin: "http://127.0.0.1:3000",
        cookie: fixtureCookieHeader("controller"),
      },
      data: { action: "local-model-check-history" },
    });
    expect(response.status()).toBe(200);
    expect(
      (await response.json()).records.some((r: any) => r.runId === value.runId),
    ).toBe(true);
  } finally {
    await fs.unlink(file);
  }
});
test("populated desktop and phone history is explicit, exportable, spaced and cleared on denial", async ({
  page,
  context,
}, info) => {
  await fixtureRole(context);
  let calls = 0,
    deny = false;
  const value = record(),
    history = {
      state: "available",
      readAt: value.checkedAt,
      records: [
        value,
        {
          ...record("unexpected-response"),
          model: "another-model:latest",
          reportedModel: "another-model",
        },
      ],
      validRecords: 2,
      withheldRecords: 1,
      occupiedSlots: 3,
      capacity: 100,
      pageLimit: 20,
      notice: "Historical results only. No model was run.",
    };
  await page.route("**/api/sync/agents", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: { providers: [], events: [], workers: [], obsidian: false },
      });
    expect(route.request().postDataJSON()).toEqual({
      action: "local-model-check-history",
    });
    calls++;
    return deny
      ? route.fulfill({ status: 403, json: { error: "Controller required" } })
      : route.fulfill({ json: history });
  });
  await page.goto("/nexus");
  await page.getByText("Connection activity", { exact: true }).click();
  const panel = page.locator(".nexus-local-model-check-history");
  await panel.locator("summary").click();
  expect(calls).toBe(0);
  await expect(
    panel.getByRole("button", {
      name: "Download saved model diagnostics",
      exact: true,
    }),
  ).toBeDisabled();
  await panel
    .getByRole("button", { name: "Read saved model diagnostics", exact: true })
    .click();
  await expect(
    panel.getByText("Historical fixed test passed", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByText("Historical test completed; unexpected response", {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await panel.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  const download = page.waitForEvent("download");
  await panel
    .getByRole("button", {
      name: "Download saved model diagnostics",
      exact: true,
    })
    .click();
  const saved = await download;
  expect(saved.suggestedFilename()).toBe(
    "nexus-local-model-check-history.json",
  );
  expect(JSON.parse(await fs.readFile((await saved.path())!, "utf8"))).toEqual(
    history,
  );
  await fs.mkdir("artifacts/local-model-check-history", { recursive: true });
  await panel.screenshot({
    path: `artifacts/local-model-check-history/${info.project.name}.png`,
  });
  deny = true;
  await panel
    .getByRole("button", { name: "Read saved model diagnostics", exact: true })
    .click();
  await expect(
    panel.getByText("Controller required", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByText("Historical fixed test passed", { exact: true }),
  ).toHaveCount(0);
  await expect(
    panel.getByRole("button", {
      name: "Download saved model diagnostics",
      exact: true,
    }),
  ).toBeDisabled();
  expect(calls).toBe(2);
});
