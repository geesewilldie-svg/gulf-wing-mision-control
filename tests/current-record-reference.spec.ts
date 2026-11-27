import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  currentRecordReference,
  inspectConversationRecord,
} from "../lib/server/current-record-reference";
import { currentRecordIntent } from "../lib/current-record-intent";
import { searchCurrentRecords } from "../lib/server/current-record-search";
import {
  saveMemory,
  deleteMemory,
  withStore,
} from "../lib/server/foundation/store";
import { POST } from "../app/api/sync/nexus/route";
import { token } from "../lib/server/sync-store";
import { fixtureRole } from "./helpers/access";
import { openAssistant } from "./helpers/assistant";
const signal = () => new AbortController().signal;
async function fixture(run: (config: any) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "record-reference-")),
    previous = process.env.GW_SYNC_DATA_DIR,
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
    throw Error("No model or research allowed");
  };
  try {
    await run(config);
  } finally {
    global.fetch = transport;
    if (previous === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = previous;
    await fs.rm(root, { recursive: true, force: true });
  }
}
const search = (workspace = "Personal") =>
  searchCurrentRecords(
    { action: "search-current-records", workspace, query: "QUARTZ", page: 0 },
    signal(),
  );
test("numbered inspection accepts numeric/cardinal/ordinal current-result wording without guessing unrelated references", () => {
  expect(currentRecordIntent("Nexus, inspect current result one.")).toEqual({
    kind: "inspect",
    number: 1,
  });
  expect(currentRecordIntent("Inspect current result third")).toEqual({
    kind: "inspect",
    number: 3,
  });
  expect(currentRecordIntent("Inspect current result number 20")).toEqual({
    kind: "inspect",
    number: 20,
  });
  expect(currentRecordIntent("Inspect current result zero")).toEqual({
    kind: "inspect",
    number: 0,
  });
  expect(currentRecordIntent("Inspect current result")).toEqual({
    kind: "help",
  });
  expect(currentRecordIntent("Don't inspect current result one")).toBeNull();
  expect(
    currentRecordIntent("A task says inspect current result one"),
  ).toBeNull();
});
test("signed selection binds exact corpus/scope and returns current content without mutator authority or writes", () =>
  fixture(async () => {
    saveMemory({
      scope: "Personal",
      kind: "fact",
      content: "QUARTZ OWNER_CURRENT",
    });
    saveMemory({
      scope: "Aviation",
      kind: "fact",
      content: "QUARTZ OTHER_SCOPE",
    });
    const found = search(),
      proof = await currentRecordReference(found, "Personal"),
      before = withStore((db) =>
        JSON.stringify({
          rows: db.prepare("SELECT * FROM memory").all(),
          events: db.prepare("SELECT * FROM events").all(),
        }),
      );
    const read = await inspectConversationRecord(
      1,
      proof,
      "Personal",
      signal(),
    );
    expect(read.recordInspection).toMatchObject({
      id: found.records[0].id,
      revision: 0,
      content: "QUARTZ OWNER_CURRENT",
      provenance: "owner-stated",
    });
    expect(read.recordSearchReference).toBe(proof);
    expect(JSON.stringify(read)).not.toContain("OTHER_SCOPE");
    expect(
      withStore((db) =>
        JSON.stringify({
          rows: db.prepare("SELECT * FROM memory").all(),
          events: db.prepare("SELECT * FROM events").all(),
        }),
      ),
    ).toBe(before);
    const all = search("all"),
      allProof = await currentRecordReference(all, "Personal");
    expect(
      (await inspectConversationRecord(2, allProof, "Personal", signal()))
        .recordInspection.scope,
    ).toBe(all.records[1].scope);
    await expect(
      inspectConversationRecord(1, allProof, "Aviation", signal()),
    ).rejects.toThrow(/workspace/);
  }));
test("missing, tampered, expired or out-of-range selections cannot read a guessed record", () =>
  fixture(async () => {
    saveMemory({ scope: "Personal", kind: "fact", content: "QUARTZ CURRENT" });
    const proof = await currentRecordReference(search(), "Personal");
    for (const bad of [
      undefined,
      {},
      "raw-id",
      proof.slice(0, -1) + (proof.endsWith("a") ? "b" : "a"),
      "x".repeat(2001),
    ])
      await expect(
        inspectConversationRecord(1, bad, "Personal", signal()),
      ).rejects.toThrow();
    for (const number of [0, 21, 1.2])
      await expect(
        inspectConversationRecord(number, proof, "Personal", signal()),
      ).rejects.toThrow(/number/);
    await expect(
      inspectConversationRecord(2, proof, "Personal", signal()),
    ).rejects.toThrow(/not in/);
    const original = Date.now;
    Date.now = () => original() + 300001;
    try {
      await expect(
        inspectConversationRecord(1, proof, "Personal", signal()),
      ).rejects.toThrow(/expired/);
    } finally {
      Date.now = original;
    }
  }));
test("correction/deletion invalidate the whole search rather than shifting an ordinal to another record", () =>
  fixture(async () => {
    saveMemory({ scope: "Personal", kind: "fact", content: "QUARTZ original" });
    saveMemory({ scope: "Personal", kind: "fact", content: "QUARTZ next" });
    const found = search(),
      proof = await currentRecordReference(found, "Personal"),
      row = found.records[0];
    saveMemory({
      id: row.id,
      revision: row.revision,
      scope: row.scope,
      kind: "fact",
      content: "QUARTZ changed",
    });
    await expect(
      inspectConversationRecord(1, proof, "Personal", signal()),
    ).rejects.toThrow(/changed/);
    const fresh = search(),
      again = await currentRecordReference(fresh, "Personal"),
      target = fresh.records[0];
    deleteMemory({ id: target.id, revision: target.revision });
    await expect(
      inspectConversationRecord(1, again, "Personal", signal()),
    ).rejects.toThrow(/changed/);
    const last = await currentRecordReference(search(), "Personal"),
      abort = new AbortController();
    abort.abort();
    await expect(
      inspectConversationRecord(1, last, "Personal", abort.signal),
    ).rejects.toThrow();
  }));
test("conversation API requires controller/local mode and gives an expiring reference without speaking record content", () =>
  fixture(async (config) => {
    saveMemory({
      scope: "Personal",
      kind: "fact",
      content: "QUARTZ PRIVATE_RECORD_TEXT",
    });
    let network = 0;
    global.fetch = async () => {
      network++;
      throw Error("No provider");
    };
    const send = (
      query: string,
      ref?: unknown,
      role: "controller" | "display" | null = "controller",
      extra = {},
    ) =>
      POST(
        new Request("http://localhost:3000/api/sync/nexus", {
          method: "POST",
          headers: {
            host: "localhost:3000",
            origin: "http://localhost:3000",
            "content-type": "application/json",
            ...(role
              ? { cookie: "gw_sync_session=" + token(config, role) }
              : {}),
          },
          body: JSON.stringify({
            query,
            mode: "auto",
            workspaceScope: "Personal",
            recordSearchReference: ref,
            ...extra,
          }),
        }),
      );
    const initial = await (
      await send("Search current records for QUARTZ")
    ).json();
    expect(typeof initial.recordSearchReference).toBe("string");
    expect(initial.answer).not.toContain("PRIVATE_RECORD_TEXT");
    expect(
      (
        await send(
          "Inspect current result one",
          initial.recordSearchReference,
          null,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await send(
          "Inspect current result one",
          initial.recordSearchReference,
          "display",
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await send(
          "Inspect current result one",
          initial.recordSearchReference,
          "controller",
          { mode: "openai", allowExternal: true },
        )
      ).status,
    ).toBe(403);
    const result = await (
      await send(
        "Inspect current result one",
        initial.recordSearchReference,
        "controller",
        {
          voiceConversation: true,
          allowExternal: true,
          publicQuery: "unused terms",
        },
      )
    ).json();
    expect(result.recordInspection.content).toBe("QUARTZ PRIVATE_RECORD_TEXT");
    expect(result.answer).not.toContain("PRIVATE_RECORD_TEXT");
    expect(result).toMatchObject({
      resetHistory: true,
      clearRecordReferences: true,
      routing: { selected: [] },
    });
    expect(result.memory).toBeUndefined();
    expect(result.task).toBeUndefined();
    expect(network).toBe(0);
  }));
test("compiled search/inspection API resolves a signed current ordinal and rejects it after correction", async ({
  context,
}) => {
  await fixtureRole(context);
  const previous = process.env.GW_SYNC_DATA_DIR;
  process.env.GW_SYNC_DATA_DIR = process.env.GW_SYNC_TEST_ROOT;
  const phrase = "SIGNEDSEARCH" + randomUUID().replaceAll("-", "");
  let row: any;
  try {
    saveMemory({
      scope: "Personal",
      kind: "fact",
      content: phrase + " current owner",
    });
    const ask = (query: string, recordSearchReference?: string) =>
      context.request.post("/api/sync/nexus", {
        data: {
          query,
          recordSearchReference,
          workspaceScope: "Personal",
          mode: "auto",
          voiceConversation: true,
        },
      });
    const found = await (
      await ask("Search current records for " + phrase)
    ).json();
    row = found.recordSearch.records[0];
    const selected = await ask(
      "Inspect current result one",
      found.recordSearchReference,
    );
    expect(selected.status()).toBe(200);
    const read = await selected.json();
    expect(read.recordInspection.id).toBe(row.id);
    expect(read.recordInspection.content).toContain(phrase);
    expect(read.answer).not.toContain(phrase);
    saveMemory({
      id: row.id,
      revision: row.revision,
      scope: row.scope,
      kind: "fact",
      content: "Corrected signed fixture",
    });
    row.revision++;
    expect(
      (
        await ask("Inspect current result one", found.recordSearchReference)
      ).status(),
    ).toBe(409);
  } finally {
    if (row) deleteMemory({ id: row.id, revision: row.revision });
    if (previous === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = previous;
  }
});
test("assistant sends result references only for inspection, renders detail without another query and invalidates after UI edits", async ({
  page,
  context,
}, info) => {
  await fixtureRole(context);
  const id = randomUUID(),
    row = {
      id,
      type: "owner",
      scope: "Personal",
      kind: "fact",
      revision: 0,
      updatedAt: "2026-11-27T12:00:00.000Z",
      title: "QUARTZ owner",
      excerpt: "QUARTZ owner",
      contentHash: "a".repeat(64),
      sourceTruncated: false,
    };
  const results = {
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
    notice: "Current records only",
  };
  let inspections = 0,
    reads = 0;
  await page.route("**/api/sync/nexus", (route) => {
    if (route.request().method() !== "POST")
      return route.fulfill({
        json: { sections: 0, sources: [], providers: [], localModel: false },
      });
    const body = route.request().postDataJSON();
    if (body.query === "Search current records for QUARTZ") {
      expect(body.recordSearchReference).toBeUndefined();
      return route.fulfill({
        json: {
          engine: "Nexus current records",
          sources: [],
          warnings: [],
          answer: "Found one result.",
          recordSearch: results,
          recordSearchReference: "fixture-signed-reference",
          resetHistory: true,
          clearRecordReferences: true,
        },
      });
    }
    expect(body.query).toBe("Inspect current result one");
    inspections++;
    if (inspections > 1) {
      expect(body.recordSearchReference).toBeUndefined();
      return route.fulfill({
        status: 409,
        json: { error: "Run a fresh current-record search first." },
      });
    }
    expect(body.recordSearchReference).toBe("fixture-signed-reference");
    return route.fulfill({
      json: {
        engine: "Nexus current records",
        sources: [],
        warnings: [],
        answer:
          "Result one is owner-stated memory. Its content is displayed below.",
        recordSearch: results,
        recordSearchReference: "fixture-signed-reference",
        recordInspection: {
          ...row,
          content: "QUARTZ selected current content",
          provenance: "owner-stated",
          inspectedAt: new Date().toISOString(),
        },
        resetHistory: true,
        clearRecordReferences: true,
      },
    });
  });
  await page.route("**/api/sync/memory/search", (route) => {
    reads++;
    return route.abort();
  });
  await page.goto("/nexus");
  await openAssistant(page);
  const drawer = page.getByRole("complementary", {
      name: "Nexus personal assistant",
      exact: true,
    }),
    input = drawer.getByRole("textbox", { name: "Ask Nexus", exact: true }),
    submit = drawer.getByRole("button", { name: "Ask Nexus", exact: true });
  await input.fill("Search current records for QUARTZ");
  await submit.click();
  await expect(
    drawer.getByRole("heading", { name: /Result 1 · Owner-stated memory/ }),
  ).toBeVisible();
  await input.fill("Inspect current result one");
  await submit.click();
  const detail = drawer.getByRole("region", {
    name: "Inspected current record",
    exact: true,
  });
  await expect(detail).toContainText("QUARTZ selected current content");
  expect(reads).toBe(0);
  expect(
    await detail.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await fs.mkdir("artifacts/current-record-reference", { recursive: true });
  await detail.screenshot({
    path: `artifacts/current-record-reference/${info.project.name}.png`,
  });
  await drawer
    .getByRole("textbox", {
      name: "Words to find in current records",
      exact: true,
    })
    .fill("another query");
  await expect(detail).toHaveCount(0);
  await input.fill("Inspect current result one");
  await submit.click();
  await expect(
    drawer.getByText("Run a fresh current-record search first.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(inspections).toBe(2);
  expect(reads).toBe(0);
});
