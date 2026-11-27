import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  searchCurrentRecords,
  inspectCurrentRecord,
} from "../lib/server/current-record-search";
import {
  saveMemory,
  deleteMemory,
  createTask,
  deleteTask,
  withStore,
} from "../lib/server/foundation/store";
import { POST } from "../app/api/sync/memory/search/route";
import { token } from "../lib/server/sync-store";
import { fixtureRole, fixtureCookieHeader } from "./helpers/access";
const signal = () => new AbortController().signal;
const search = (
  query = "QUARTZ",
  workspace = "Personal",
  page = 0,
  stamp?: string,
) =>
  searchCurrentRecords(
    {
      action: "search-current-records",
      query,
      workspace,
      page,
      ...(stamp ? { stamp } : {}),
    },
    signal(),
  );
const inspect = (
  r: ReturnType<typeof search>["records"][number],
  workspace = "Personal",
) =>
  inspectCurrentRecord(
    {
      action: "inspect-current-record",
      workspace,
      type: r.type,
      id: r.id,
      revision: r.revision,
      contentHash: r.contentHash,
    },
    signal(),
  );
async function fixture(run: () => Promise<void>) {
  const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "current-record-search-"),
    ),
    prior = process.env.GW_SYNC_DATA_DIR,
    transport = global.fetch;
  process.env.GW_SYNC_DATA_DIR = root;
  global.fetch = async () => {
    throw Error("Search must not contact a provider");
  };
  try {
    await run();
  } finally {
    global.fetch = transport;
    if (prior === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = prior;
    await fs.rm(root, { recursive: true, force: true });
  }
}
function task(request: string, output: string, scope = "Personal") {
  const id = createTask({ request, scope, mode: "plan" });
  withStore((db) =>
    db
      .prepare("UPDATE tasks SET state='completed',output=? WHERE id=?")
      .run(output, id),
  );
  return id;
}
test("live scoped records preserve owner/task provenance and exclude snapshots, corrections and other workspaces", () =>
  fixture(async () => {
    const owner = saveMemory({
      scope: "Personal",
      kind: "fact",
      content: "QUARTZ Samsung phone",
    });
    saveMemory({
      scope: "Aviation",
      kind: "fact",
      content: "QUARTZ PRIVATE_AVIATION",
    });
    task("QUARTZ work", "QUARTZ UNVERIFIED_ARTIFACT");
    const root = process.env.GW_SYNC_DATA_DIR!;
    await fs.writeFile(
      path.join(root, "old-snapshot.md"),
      "QUARTZ FORGOTTEN_SNAPSHOT",
    );
    const found = search();
    expect(found).toMatchObject({
      totalRecords: 2,
      scannedRecords: 2,
      matchedRecords: 2,
      outsideBudgetRecords: 0,
    });
    expect(found.records.map((r) => r.type).sort()).toEqual(["owner", "task"]);
    expect(JSON.stringify(found)).not.toMatch(
      /PRIVATE_AVIATION|FORGOTTEN_SNAPSHOT/,
    );
    for (const row of found.records)
      expect(inspect(row).provenance).toBe(
        row.type === "owner" ? "owner-stated" : "unverified-task-record",
      );
    expect(search("QUARTZ", "all").matchedRecords).toBe(3);
    const row = found.records.find((r) => r.type === "owner")!;
    saveMemory({
      id: row.id,
      revision: row.revision,
      scope: "Personal",
      kind: "fact",
      content: "Corrected device",
    });
    expect(search().matchedRecords).toBe(1);
    expect(() => inspect(row)).toThrow(/changed/);
    const current = search("Corrected").records[0];
    deleteMemory({ id: current.id, revision: current.revision });
    expect(search("Corrected").matchedRecords).toBe(0);
    expect(() => inspect(current)).toThrow(/removed/);
  }));
test("literal all-word matching is case folded and never interprets SQL/FTS wildcard syntax", () =>
  fixture(async () => {
    saveMemory({
      scope: "Personal",
      kind: "fact",
      content:
        "Quartz Android phone, 100% supported underscore_ and apostrophe ' literal",
    });
    expect(search("phone QUARTZ android").matchedRecords).toBe(1);
    expect(search("100%").matchedRecords).toBe(1);
    expect(search("underscore_").matchedRecords).toBe(1);
    expect(search("' OR 1=1").matchedRecords).toBe(0);
    expect(search("*").matchedRecords).toBe(0);
  }));
test("stable twenty-result pages reject revisions, deleted rows and cross-query stamps", () =>
  fixture(async () => {
    for (let i = 0; i < 25; i++)
      saveMemory({
        scope: "Personal",
        kind: "fact",
        content: `QUARTZ item ${i}`,
      });
    const first = search();
    expect(first.records).toHaveLength(20);
    const next = search("QUARTZ", "Personal", 1, first.stamp);
    expect(next.records).toHaveLength(5);
    expect(
      new Set([...first.records, ...next.records].map((r) => r.id)).size,
    ).toBe(25);
    expect(() => search("different", "Personal", 1, first.stamp)).toThrow(
      /changed/,
    );
    const row = next.records[0];
    saveMemory({
      id: row.id,
      revision: row.revision,
      scope: "Personal",
      kind: "fact",
      content: "QUARTZ changed",
    });
    expect(() => search("QUARTZ", "Personal", 1, first.stamp)).toThrow(
      /changed/,
    );
    expect(() => inspect(row)).toThrow(/changed/);
    expect(() => search("QUARTZ", "Personal", 0, first.stamp)).toThrow(
      /changed/,
    );
  }));
test("budget coverage and full inspection distinguish bounded task output from complete records", () =>
  fixture(async () => {
    task("QUARTZ title", "a".repeat(20000) + "SECRET_AFTER_LIMIT");
    const found = search();
    expect(found.truncatedRecords).toBe(1);
    const detail = inspect(found.records[0]);
    expect(detail.sourceTruncated).toBe(true);
    expect(detail.content.length).toBeLessThanOrEqual(22001);
    expect(detail.content).not.toContain("SECRET_AFTER_LIMIT");
    expect(search("SECRET_AFTER_LIMIT").matchedRecords).toBe(0);
    withStore((db) => {
      const put = db.prepare(
        "INSERT INTO memory VALUES(?,0,'fact','Personal',?,'2026-11-27T12:00:00.000Z')",
      );
      for (let i = 0; i < 501; i++) put.run(randomUUID(), `QUARTZ owner ${i}`);
    });
    const all = search();
    expect(all).toMatchObject({
      totalRecords: 502,
      scannedRecords: 501,
      outsideBudgetRecords: 1,
      matchedRecords: 501,
    });
  }));
test("scope, exact fields, page and cancellation guards reject unsupported retrieval", () =>
  fixture(async () => {
    const value = {
      action: "search-current-records",
      workspace: "Personal",
      query: "QUARTZ",
      page: 0,
    };
    for (const change of [
      { workspace: "unknown" },
      { query: " " },
      { query: "x".repeat(201) },
      { query: "a b c d e f g h i" },
      { query: "bad\0data" },
      { page: -1 },
      { page: 1 },
      { page: 75 },
      { provider: "external" },
      { path: "/private" },
    ])
      expect(() =>
        searchCurrentRecords({ ...value, ...change }, signal()),
      ).toThrow();
    const c = new AbortController();
    c.abort();
    expect(() => searchCurrentRecords(value, c.signal)).toThrow();
    expect(() =>
      inspectCurrentRecord(
        {
          action: "inspect-current-record",
          workspace: "Personal",
          type: "memory_history",
          id: "id",
          revision: 0,
          contentHash: "a".repeat(64),
        },
        signal(),
      ),
    ).toThrow();
  }));
test("reads do not alter logical records, history, task states or events; out-of-band content changes invalidate profile hashes", () =>
  fixture(async () => {
    saveMemory({ scope: "Personal", kind: "fact", content: "QUARTZ DEVICE" });
    const id = task("QUARTZ request", "Saved output");
    const snapshot = () =>
      withStore((db) =>
        JSON.stringify({
          memory: db.prepare("SELECT * FROM memory").all(),
          tasks: db.prepare("SELECT * FROM tasks").all(),
          history: db.prepare("SELECT * FROM memory_history").all(),
          events: db.prepare("SELECT * FROM events").all(),
        }),
      );
    const before = snapshot(),
      found = search();
    for (const row of found.records) inspect(row);
    expect(snapshot()).toBe(before);
    const row = found.records.find((r) => r.type === "task")!;
    withStore((db) =>
      db.prepare("UPDATE tasks SET output='Other output' WHERE id=?").run(id),
    );
    expect(() => inspect(row)).toThrow(/changed/);
    expect(search().stamp).not.toBe(found.stamp);
    withStore((db) => db.prepare("DELETE FROM tasks WHERE id=?").run(id));
    expect(() => inspect(row)).toThrow(/removed/);
  }));
test("controller, origin and bounded exact-body API guards apply before record access", () =>
  fixture(async () => {
    const config = {
      version: 1 as const,
      pairingHash: "a".repeat(64),
      signingSecret: "b".repeat(64),
    };
    await fs.writeFile(
      path.join(process.env.GW_SYNC_DATA_DIR!, "sync-config.json"),
      JSON.stringify(config),
    );
    const send = (
      role: "controller" | "display" | null,
      origin = "http://localhost:3000",
      extra = {},
    ) =>
      POST(
        new Request("http://localhost:3000/api/sync/memory/search", {
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
            action: "search-current-records",
            query: "QUARTZ",
            workspace: "Personal",
            page: 0,
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
    expect(
      (await send("controller", undefined, { query: "x".repeat(3001) })).status,
    ).toBe(413);
    expect((await send("controller")).status).toBe(200);
  }));
test("compiled production API reads current Foundation rows and rejects stale inspections after correction", async ({
  context,
}) => {
  await fixtureRole(context);
  const previous = process.env.GW_SYNC_DATA_DIR;
  process.env.GW_SYNC_DATA_DIR = process.env.GW_SYNC_TEST_ROOT;
  const query = "SEARCHPROD" + randomUUID().replaceAll("-", "");
  let row: any;
  try {
    saveMemory({
      scope: "Personal",
      kind: "fact",
      content: query + " owner content",
    });
    const response = await context.request.post("/api/sync/memory/search", {
      headers: { cookie: fixtureCookieHeader("controller") },
      data: {
        action: "search-current-records",
        workspace: "Personal",
        query,
        page: 0,
      },
    });
    expect(response.status()).toBe(200);
    row = (await response.json()).records[0];
    expect(row.type).toBe("owner");
    const body = {
      action: "inspect-current-record",
      workspace: "Personal",
      type: row.type,
      id: row.id,
      revision: row.revision,
      contentHash: row.contentHash,
    };
    expect(
      (
        await context.request.post("/api/sync/memory/search", { data: body })
      ).status(),
    ).toBe(200);
    saveMemory({
      id: row.id,
      revision: row.revision,
      scope: "Personal",
      kind: "fact",
      content: "Corrected production fixture",
    });
    expect(
      (
        await context.request.post("/api/sync/memory/search", { data: body })
      ).status(),
    ).toBe(409);
    deleteMemory({ id: row.id, revision: row.revision + 1 });
    row = null;
  } finally {
    if (row)
      withStore((db) =>
        db.prepare("DELETE FROM memory WHERE id=?").run(row.id),
      );
    if (previous === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = previous;
  }
});
test("desktop and phone explicitly search, inspect and page with scope identity and clear stale or denied data", async ({
  page,
  context,
}, info) => {
  await fixtureRole(context);
  let calls = 0,
    mode = "normal";
  const rows = Array.from({ length: 23 }, (_, i) => ({
    id: randomUUID(),
    revision: 0,
    type: i % 2 ? "task" : "owner",
    scope: i % 2 ? "Co-hosting" : "Personal",
    kind: i % 2 ? "completed" : "fact",
    updatedAt: "2026-11-27T12:00:00.000Z",
    title: `QUARTZ record ${i}`,
    excerpt: `QUARTZ excerpt ${i}`,
    contentHash: "a".repeat(64),
    sourceTruncated: false,
  }));
  await page.route("**/api/sync/memory/search", (route) => {
    calls++;
    const body = route.request().postDataJSON();
    if (mode === "deny")
      return route.fulfill({
        status: 403,
        json: { error: "Controller required" },
      });
    if (mode === "stale") {
      expect(body.stamp).toBe("b".repeat(64));
      return route.fulfill({
        status: 409,
        json: { error: "Current memory changed. Run a fresh search." },
      });
    }
    if (body.action === "inspect-current-record") {
      const row = rows.find((r) => r.id === body.id)!;
      expect(body.contentHash).toBe(row.contentHash);
      expect(body.workspace).toBe("all");
      return route.fulfill({
        json: {
          ...row,
          content:
            "QUARTZ current content, not a snapshot.\nStored text remains data.",
          provenance:
            row.type === "owner" ? "owner-stated" : "unverified-task-record",
          inspectedAt: new Date().toISOString(),
        },
      });
    }
    expect(body.action).toBe("search-current-records");
    expect(body.query).toBe("QUARTZ");
    expect(body.workspace).toBe("all");
    if (body.page > 0) expect(body.stamp).toBe("b".repeat(64));
    return route.fulfill({
      json: {
        workspace: body.workspace,
        query: body.query,
        page: body.page,
        stamp: "b".repeat(64),
        readAt: new Date().toISOString(),
        totalRecords: 23,
        scannedRecords: 23,
        matchedRecords: 23,
        outsideBudgetRecords: 0,
        truncatedRecords: 0,
        pageSize: 20,
        records: rows.slice(body.page * 20, body.page * 20 + 20),
        notice:
          "Current Foundation records only. Owner statements and unverified task artifacts stay distinct.",
      },
    });
  });
  await page.goto("/nexus");
  await page
    .getByRole("navigation", { name: "Nexus sections" })
    .getByRole("button", { name: "Memory", exact: true })
    .click();
  const panel = page.locator(".nexus-current-record-search");
  await panel.locator("summary").first().click();
  expect(calls).toBe(0);
  await panel
    .getByRole("combobox", { name: "Record workspace", exact: true })
    .selectOption("all");
  await panel
    .getByRole("textbox", {
      name: "Words to find in current records",
      exact: true,
    })
    .fill("QUARTZ");
  await panel
    .getByRole("button", { name: "Search current records", exact: true })
    .click();
  await expect(panel.getByText("23 matches", { exact: false })).toBeVisible();
  await panel
    .getByRole("button", {
      name: `Inspect current memory · ${rows[0].id}`,
      exact: true,
    })
    .click();
  await expect(
    panel.getByRole("region", {
      name: "Inspected current record",
      exact: true,
    }),
  ).toContainText("not independently verified facts");
  expect(
    await panel.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await fs.mkdir("artifacts/current-record-search", { recursive: true });
  const fields = await panel.locator("form > label").evaluateAll((nodes) =>
    nodes.map((el) => {
      const box = el.getBoundingClientRect();
      const control = el.querySelector("select,input")!.getBoundingClientRect();
      return {
        top: box.top,
        bottom: box.bottom,
        gap: getComputedStyle(el).gap,
        height: control.height,
      };
    }),
  );
  expect(fields[1].top - fields[0].bottom).toBeGreaterThanOrEqual(15);
  for (const field of fields) {
    expect(field.gap).toBe("8px");
    expect(field.height).toBeGreaterThanOrEqual(44);
  }
  await panel.locator("form").screenshot({
    path: `artifacts/current-record-search/${info.project.name}-controls.png`,
  });
  await panel
    .getByRole("region", { name: "Inspected current record", exact: true })
    .screenshot({
      path: `artifacts/current-record-search/${info.project.name}-owner.png`,
    });
  await panel
    .getByRole("button", {
      name: `Inspect current task · ${rows[1].id}`,
      exact: true,
    })
    .click();
  await expect(
    panel.getByRole("region", {
      name: "Inspected current record",
      exact: true,
    }),
  ).toContainText("A completed state does not prove external work happened.");
  await panel
    .getByRole("region", { name: "Inspected current record", exact: true })
    .screenshot({
      path: `artifacts/current-record-search/${info.project.name}-task.png`,
    });
  await panel
    .getByRole("button", { name: "Next record page", exact: true })
    .click();
  await expect(panel.getByText("Page 2", { exact: false })).toBeVisible();
  await expect(
    panel.getByRole("region", {
      name: "Inspected current record",
      exact: true,
    }),
  ).toHaveCount(0);
  mode = "stale";
  await panel
    .getByRole("button", { name: "Previous record page", exact: true })
    .click();
  await expect(panel).toContainText("Current memory changed");
  await expect(
    panel.getByRole("region", {
      name: "Current record search results",
      exact: true,
    }),
  ).toHaveCount(0);
  mode = "deny";
  await panel
    .getByRole("button", { name: "Search current records", exact: true })
    .click();
  await expect(panel).toContainText("Controller required");
  expect(calls).toBe(6);
});
test("display-role devices cannot start private current-record searches", async ({
  page,
  context,
}) => {
  await fixtureRole(context, "display");
  let calls = 0;
  await page.route("**/api/sync/memory/search", (route) => {
    calls++;
    return route.abort();
  });
  await page.goto("/nexus");
  await page
    .getByRole("navigation", { name: "Nexus sections" })
    .getByRole("button", { name: "Memory", exact: true })
    .click();
  const panel = page.locator(".nexus-current-record-search");
  await panel.locator("summary").first().click();
  await expect(
    panel.getByRole("button", { name: "Search current records", exact: true }),
  ).toBeDisabled();
  expect(calls).toBe(0);
});
test("changing the query or workspace clears cached results without sending a new request", async ({
  page,
  context,
}) => {
  await fixtureRole(context);
  let calls = 0;
  await page.route("**/api/sync/memory/search", (route) => {
    calls++;
    const body = route.request().postDataJSON();
    return route.fulfill({
      json: {
        workspace: body.workspace,
        query: body.query,
        page: 0,
        stamp: "a".repeat(64),
        readAt: new Date().toISOString(),
        totalRecords: 0,
        scannedRecords: 0,
        matchedRecords: 0,
        outsideBudgetRecords: 0,
        truncatedRecords: 0,
        pageSize: 20,
        records: [],
        notice: "Current scoped result",
      },
    });
  });
  await page.goto("/nexus");
  await page
    .getByRole("navigation", { name: "Nexus sections" })
    .getByRole("button", { name: "Memory", exact: true })
    .click();
  const panel = page.locator(".nexus-current-record-search");
  await panel.locator("summary").first().click();
  const query = panel.getByRole("textbox", {
    name: "Words to find in current records",
    exact: true,
  });
  await query.fill("QUARTZ");
  await panel
    .getByRole("button", { name: "Search current records", exact: true })
    .click();
  await expect(
    panel.getByRole("region", {
      name: "Current record search results",
      exact: true,
    }),
  ).toBeVisible();
  await query.fill("new words");
  await expect(
    panel.getByRole("region", {
      name: "Current record search results",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(calls).toBe(1);
  await panel
    .getByRole("button", { name: "Search current records", exact: true })
    .click();
  await expect(
    panel.getByRole("region", {
      name: "Current record search results",
      exact: true,
    }),
  ).toBeVisible();
  await panel
    .getByRole("combobox", { name: "Record workspace", exact: true })
    .selectOption("Aviation");
  await expect(
    panel.getByRole("region", {
      name: "Current record search results",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(calls).toBe(2);
});
test("Unicode output keeps the declared character profile without treating surrogate pairs as extra source characters", () =>
  fixture(async () => {
    task("QUARTZ Unicode", "😀".repeat(20000));
    const found = search("QUARTZ");
    const detail = inspect(found.records[0]);
    expect(detail.sourceTruncated).toBe(false);
    expect(detail.content).toContain("😀".repeat(20000));
    expect(detail.content.length).toBeLessThanOrEqual(44001);
    expect(search("😀").matchedRecords).toBe(1);
  }));
test("desktop and phone accept bounded Unicode task inspection beyond the ASCII code-unit length", async ({
  page,
  context,
}) => {
  await fixtureRole(context);
  const row = {
      id: randomUUID(),
      revision: 0,
      type: "task",
      scope: "Personal",
      kind: "completed",
      updatedAt: "2026-11-27T12:00:00.000Z",
      title: "QUARTZ Unicode",
      excerpt: "QUARTZ Unicode",
      contentHash: "a".repeat(64),
      sourceTruncated: false,
    },
    content = "QUARTZ Unicode\n" + "😀".repeat(18000);
  await page.route("**/api/sync/memory/search", (route) => {
    const body = route.request().postDataJSON();
    return route.fulfill({
      json:
        body.action === "search-current-records"
          ? {
              workspace: "Personal",
              query: body.query,
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
              notice: "Current Unicode task",
            }
          : {
              ...row,
              content,
              provenance: "unverified-task-record",
              inspectedAt: new Date().toISOString(),
            },
    });
  });
  await page.goto("/nexus");
  await page
    .getByRole("navigation", { name: "Nexus sections" })
    .getByRole("button", { name: "Memory", exact: true })
    .click();
  const panel = page.locator(".nexus-current-record-search");
  await panel.locator("summary").first().click();
  await panel
    .getByRole("textbox", {
      name: "Words to find in current records",
      exact: true,
    })
    .fill("QUARTZ");
  await panel
    .getByRole("button", { name: "Search current records", exact: true })
    .click();
  await panel
    .getByRole("button", {
      name: `Inspect current task · ${row.id}`,
      exact: true,
    })
    .click();
  const detail = panel.getByRole("region", {
    name: "Inspected current record",
    exact: true,
  });
  await expect(detail).toBeVisible();
  expect(await detail.locator("pre").textContent()).toBe(content);
  expect(
    await detail.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
});
