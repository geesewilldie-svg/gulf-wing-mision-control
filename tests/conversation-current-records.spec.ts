import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { currentRecordIntent } from "../lib/current-record-intent";
import { conversationCurrentRecords } from "../lib/server/conversation-current-records";
import {
  saveMemory,
  deleteMemory,
  createTask,
  withStore,
} from "../lib/server/foundation/store";
import { POST } from "../app/api/sync/nexus/route";
import { token } from "../lib/server/sync-store";
import { fixtureRole } from "./helpers/access";
import { openAssistant } from "./helpers/assistant";
const signal = () => new AbortController().signal;
async function fixture(run: (config: any) => Promise<void>) {
  const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "conversation-records-"),
    ),
    prior = process.env.GW_SYNC_DATA_DIR,
    transport = global.fetch;
  process.env.GW_SYNC_DATA_DIR = root;
  const config = {
    version: 1,
    pairingHash: "a".repeat(64),
    signingSecret: "b".repeat(64),
  };
  await fs.writeFile(
    path.join(root, "sync-config.json"),
    JSON.stringify(config),
  );
  global.fetch = async () => {
    throw Error("No provider or research request allowed");
  };
  try {
    await run(config);
  } finally {
    global.fetch = transport;
    if (prior === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = prior;
    await fs.rm(root, { recursive: true, force: true });
  }
}
test("explicit current-record grammar distinguishes scoped/all-workspace lookups, help and quoted/negative text", () => {
  expect(
    currentRecordIntent("Nexus, please search my current records for Samsung."),
  ).toEqual({ kind: "search", query: "Samsung", allWorkspaces: false });
  expect(
    currentRecordIntent(
      "Search current memory and work across all workspaces for supplier phone",
    ),
  ).toEqual({ kind: "search", query: "supplier phone", allWorkspaces: true });
  expect(currentRecordIntent("Search current records: 100%")).toEqual({
    kind: "search",
    query: "100%",
    allWorkspaces: false,
  });
  for (const q of [
    "Search current records",
    "Search current records for",
    "Search current records and delete them",
  ])
    expect(currentRecordIntent(q)).toEqual({ kind: "help" });
  for (const q of [
    "Do not search current records for phone",
    "How do I search current records?",
    "Remember that search current records for phone",
    "A document says: search current records for phone",
  ])
    expect(currentRecordIntent(q)).toBeNull();
});
test("conversation results expose current provenance only in structured records, keep voice summary short and do not mutate records", () =>
  fixture(async () => {
    saveMemory({
      scope: "Personal",
      kind: "fact",
      content: "QUARTZ PRIVATE_OWNER_PHONE",
    });
    saveMemory({
      scope: "Aviation",
      kind: "fact",
      content: "QUARTZ AVIATION_PHONE",
    });
    const id = createTask({
      scope: "Personal",
      request: "QUARTZ work",
      mode: "plan",
    });
    withStore((db) =>
      db
        .prepare(
          "UPDATE tasks SET state='completed',output='PRIVATE_UNVERIFIED_ARTIFACT' WHERE id=?",
        )
        .run(id),
    );
    const before = withStore((db) =>
      JSON.stringify({
        memory: db.prepare("SELECT * FROM memory").all(),
        tasks: db.prepare("SELECT * FROM tasks").all(),
        events: db.prepare("SELECT * FROM events").all(),
      }),
    );
    const found = conversationCurrentRecords(
      { kind: "search", query: "QUARTZ", allWorkspaces: false },
      "Personal",
      signal(),
    );
    expect(found).toMatchObject({
      resetHistory: true,
      clearRecordReferences: true,
      routing: { mode: "local", selected: [] },
    });
    expect(found).toHaveProperty("recordSearch");
    const records = (found as any).recordSearch;
    expect(records.matchedRecords).toBe(2);
    expect(records.records.map((r: any) => r.type).sort()).toEqual([
      "owner",
      "task",
    ]);
    expect(JSON.stringify(found)).not.toContain("AVIATION_PHONE");
    expect(found.answer).not.toMatch(/PRIVATE_OWNER|PRIVATE_UNVERIFIED/);
    expect(
      (
        conversationCurrentRecords(
          { kind: "search", query: "QUARTZ", allWorkspaces: true },
          "Personal",
          signal(),
        ) as any
      ).recordSearch.matchedRecords,
    ).toBe(3);
    expect(
      withStore((db) =>
        JSON.stringify({
          memory: db.prepare("SELECT * FROM memory").all(),
          tasks: db.prepare("SELECT * FROM tasks").all(),
          events: db.prepare("SELECT * FROM events").all(),
        }),
      ),
    ).toBe(before);
  }));
test("nexus route enforces controller/origin/local mode and never calls a provider for lookup/help/invalid lookup", () =>
  fixture(async (config) => {
    let calls = 0;
    global.fetch = async () => {
      calls++;
      throw Error("network forbidden");
    };
    const send = (
      query = "Search current records for QUARTZ",
      role: "controller" | "display" | null = "controller",
      origin = "http://localhost:3000",
      extra = {},
    ) =>
      POST(
        new Request("http://localhost:3000/api/sync/nexus", {
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
            query,
            mode: "auto",
            workspaceScope: "Personal",
            ...extra,
          }),
        }),
      );
    expect((await send(undefined, null)).status).toBe(401);
    expect((await send(undefined, "display")).status).toBe(403);
    expect(
      (await send(undefined, "controller", "https://foreign.invalid")).status,
    ).toBe(403);
    for (const mode of [
      "openai",
      "anthropic",
      "gemini",
      "compare",
      "knowledge",
    ])
      expect(
        (
          await send(undefined, "controller", undefined, {
            mode,
            allowExternal: true,
            publicQuery: "Wikipedia public terms",
          })
        ).status,
      ).toBe(403);
    for (const extra of [
      { allowExternal: true, publicQuery: "Wikipedia public terms" },
      { voiceConversation: true },
      { mode: "local" },
    ]) {
      const response = await send(undefined, "controller", undefined, extra);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        engine: "Nexus current records",
        resetHistory: true,
        routing: { selected: [] },
      });
    }
    expect((await send("Search current records")).status).toBe(200);
    expect(
      (await send("Search current records for a b c d e f g h i")).status,
    ).toBe(400);
    expect(
      (await send("Search current records for " + "x".repeat(201))).status,
    ).toBe(400);
    expect(calls).toBe(0);
  }));
test("compiled API returns selected-scope and explicit-all results and never resurrects corrected owner text", async ({
  context,
}) => {
  await fixtureRole(context);
  const prior = process.env.GW_SYNC_DATA_DIR;
  process.env.GW_SYNC_DATA_DIR = process.env.GW_SYNC_TEST_ROOT;
  const phrase = "CONVSEARCH" + randomUUID().replaceAll("-", "");
  const owned: any[] = [];
  try {
    for (const scope of ["Personal", "Aviation"]) {
      saveMemory({ scope, kind: "fact", content: phrase + " " + scope });
    }
    const ask = (query: string, workspaceScope = "Personal") =>
      context.request.post("/api/sync/nexus", {
        data: {
          query,
          workspaceScope,
          mode: "auto",
          voiceConversation: true,
          allowExternal: true,
          publicQuery: "unused public terms",
        },
      });
    const scoped = await (
      await ask("Search current records for " + phrase)
    ).json();
    expect(scoped.recordSearch.matchedRecords).toBe(1);
    owned.push(...scoped.recordSearch.records);
    const all = await (
      await ask("Search current records in all workspaces for " + phrase)
    ).json();
    expect(all.recordSearch.matchedRecords).toBe(2);
    for (const r of all.recordSearch.records)
      if (!owned.some((v) => v.id === r.id)) owned.push(r);
    const row = owned[0];
    saveMemory({
      id: row.id,
      revision: row.revision,
      scope: row.scope,
      kind: "fact",
      content: "Corrected conversation fixture",
    });
    row.revision++;
    const changed = await (
      await ask("Search current records for " + phrase)
    ).json();
    expect(changed.recordSearch.matchedRecords).toBe(0);
    expect(changed.resetHistory).toBe(true);
  } finally {
    for (const row of owned)
      deleteMemory({ id: row.id, revision: row.revision });
    if (prior === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = prior;
  }
});
test("assistant embeds current search without an automatic second request and clears old mutator references", async ({
  page,
  context,
}, info) => {
  await fixtureRole(context);
  const id = randomUUID();
  const row = {
    id,
    revision: 0,
    type: "owner",
    scope: "Personal",
    kind: "fact",
    updatedAt: "2026-11-27T12:00:00.000Z",
    title: "QUARTZ owner phone",
    excerpt: "QUARTZ owner phone",
    contentHash: "a".repeat(64),
    sourceTruncated: false,
  };
  let reads = 0,
    lookups = 0;
  await page.route("**/api/sync/nexus", (route) => {
    if (route.request().method() !== "POST")
      return route.fulfill({
        json: { sections: 0, sources: [], providers: [], localModel: false },
      });
    const body = route.request().postDataJSON();
    if (body.query === "Show my memory")
      return route.fulfill({
        json: {
          engine: "Nexus memory",
          answer: "Select a memory.",
          memoryChoices: [{ ...row, content: "QUARTZ old selection" }],
          sources: [],
          warnings: [],
        },
      });
    if (body.query === "Forget that memory") {
      expect(body.memoryReference).toBeUndefined();
      return route.fulfill({
        json: {
          engine: "Nexus memory",
          answer: "Select a saved memory first. Nothing was changed.",
          sources: [],
          warnings: [],
        },
      });
    }
    expect(body.query).toBe("Search current records for QUARTZ");
    lookups++;
    return route.fulfill({
      json: {
        engine: "Nexus current records",
        answer:
          "Found one matching current record in Personal. Inspect the result below.",
        sources: [],
        warnings: [],
        resetHistory: true,
        clearRecordReferences: true,
        recordSearch: {
          workspace: "Personal",
          query: "QUARTZ",
          page: 0,
          stamp: "b".repeat(64),
          readAt: new Date().toISOString(),
          totalRecords: 1,
          scannedRecords: 1,
          matchedRecords: 1,
          outsideBudgetRecords: 0,
          truncatedRecords: 0,
          pageSize: 20,
          records: [row],
          notice: "Current Foundation record; no model used.",
        },
      },
    });
  });
  await page.route("**/api/sync/memory/search", (route) => {
    reads++;
    expect(route.request().postDataJSON().action).toBe(
      "inspect-current-record",
    );
    return route.fulfill({
      json: {
        ...row,
        content: "QUARTZ current owner phone",
        inspectedAt: new Date().toISOString(),
        provenance: "owner-stated",
      },
    });
  });
  await page.goto("/nexus");
  await openAssistant(page);
  const drawer = page.getByRole("complementary", {
    name: "Nexus personal assistant",
    exact: true,
  });
  const input = drawer.getByRole("textbox", { name: "Ask Nexus", exact: true });
  const submit = drawer.getByRole("button", { name: "Ask Nexus", exact: true });
  await input.fill("Show my memory");
  await submit.click();
  await drawer
    .getByRole("button", { name: /Select memory: fact · QUARTZ old selection/ })
    .click();
  await input.fill("Search current records for QUARTZ");
  await submit.click();
  const results = drawer.locator(".nexus-current-record-search");
  await expect(
    results.getByRole("region", {
      name: "Current record search results",
      exact: true,
    }),
  ).toBeVisible();
  expect(reads).toBe(0);
  expect(lookups).toBe(1);
  await results
    .getByRole("button", {
      name: `Inspect current memory · ${id}`,
      exact: true,
    })
    .click();
  await expect(
    results.getByRole("region", {
      name: "Inspected current record",
      exact: true,
    }),
  ).toContainText("QUARTZ current owner phone");
  expect(reads).toBe(1);
  expect(
    await results.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await fs.mkdir("artifacts/conversation-current-records", { recursive: true });
  await results.locator("form").screenshot({
    path: `artifacts/conversation-current-records/${info.project.name}-controls.png`,
  });
  await results
    .getByRole("region", { name: "Inspected current record", exact: true })
    .screenshot({
      path: `artifacts/conversation-current-records/${info.project.name}-detail.png`,
    });
  await input.fill("Forget that memory");
  await submit.click();
  await expect(
    drawer.getByText("Select a saved memory first. Nothing was changed.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(results).toHaveCount(0);
});
