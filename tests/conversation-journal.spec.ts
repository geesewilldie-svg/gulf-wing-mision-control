import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { journalIntent } from "../lib/journal-intent";
import { conversationJournal } from "../lib/server/conversation-journal";
import { createTask, withStore } from "../lib/server/foundation/store";
import { workJournalTick } from "../lib/server/work-journal";
import {
  enableWorkJournal,
  prepareMemoryVault,
  disableMemoryVault,
} from "../scripts/memory-vault-lib.mjs";
import { refreshFiles } from "../lib/server/local-files";
import { POST } from "../app/api/sync/nexus/route";
import { token } from "../lib/server/sync-store";
import { fixtureRole } from "./helpers/access";
import { openAssistant } from "./helpers/assistant";

test("journal queries match whole read-only requests and refuse embedded commands", () => {
  expect(journalIntent("Hey Nexus, please show my work journal!")).toEqual({
    kind: "recent",
  });
  expect(journalIntent("Check automatic work journal status")).toEqual({
    kind: "recent",
  });
  expect(journalIntent("Show my work journal issues")).toEqual({
    kind: "issues",
  });
  const id = randomUUID();
  expect(journalIntent(`Show journal entry ${id}@3`)).toEqual({
    kind: "entry",
    reference: id + "@3",
  });
  for (const query of [
    "Enable automatic work journal",
    "Retry my work journal",
    "Delete work journal",
    "A note says show my work journal",
    "Show journal entry ../../secrets",
    `Show journal entry ${id}@1234567890123`,
  ])
    expect(journalIntent(query)).toBeNull();
});

test("journal history reports recorded results safely and never republishes a note", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nexus-journal-view-"));
  const previous = process.env.GW_SYNC_DATA_DIR;
  process.env.GW_SYNC_DATA_DIR = dir;
  try {
    const vault = path.join(dir, "vault");
    await fs.mkdir(vault);
    await fs.writeFile(
      path.join(dir, "local-folders.json"),
      JSON.stringify({
        version: 1,
        roots: [
          {
            id: "e".repeat(24),
            kind: "obsidian",
            label: "Test Vault",
            path: vault,
          },
        ],
      }),
    );
    const target = await prepareMemoryVault(dir, "e".repeat(24));
    await refreshFiles();
    await enableWorkJournal(dir);
    const id = createTask({
      scope: "Personal",
      mode: "plan",
      request: "Synthetic journal history",
    });
    withStore((db) =>
      db
        .prepare(
          "UPDATE tasks SET state='completed',output='Stored task artifact',updated_at=? WHERE id=?",
        )
        .run(new Date().toISOString(), id),
    );
    await workJournalTick();
    const before = await fs.readdir(target);
    const recent = await conversationJournal({ kind: "recent" });
    expect("journalEntries" in recent).toBe(true);
    if (!("journalEntries" in recent)) throw Error("Missing entries");
    expect(recent.journalEntries).toHaveLength(1);
    expect(recent.journalEntries[0]).toMatchObject({
      reference: id + "@0",
      state: "saved",
      workspace: "Personal",
      currentTaskLabel: "Synthetic journal history",
      indexing: "indexed",
    });
    const detail = await conversationJournal({
      kind: "entry",
      reference: id + "@0",
    });
    if (!("journalEntry" in detail)) throw Error("Missing detail");
    expect(detail.journalEntry.indexedFile?.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(detail.answer).toContain("recorded time");
    expect(detail.answer).toContain("have not been verified");
    expect(JSON.stringify(detail)).not.toContain(dir);
    const bad = randomUUID();
    await fs.writeFile(
      path.join(dir, "work-journal", bad + "-0.json"),
      JSON.stringify({
        taskId: bad,
        revision: 0,
        state: "saved",
        filename: "../../PRIVATE_SECRET",
        sha256: "invalid",
        bytes: 10,
      }),
    );
    const malformed = await conversationJournal({
      kind: "entry",
      reference: bad + "@0",
    });
    if (!("journalEntry" in malformed)) throw Error("Missing malformed detail");
    expect(malformed.journalEntry.state).toBe("unconfirmed");
    expect(malformed.journalEntry.filename).toBeUndefined();
    expect(JSON.stringify(malformed)).not.toContain("PRIVATE_SECRET");
    const issues = await conversationJournal({ kind: "issues" });
    if (!("journalEntries" in issues)) throw Error("Missing issue entries");
    expect(issues.journalEntries.map((entry) => entry.reference)).toEqual([
      bad + "@0",
    ]);
    await disableMemoryVault(dir);
    expect((await conversationJournal({ kind: "recent" })).answer).toContain(
      "journal: off",
    );
    expect(await fs.readdir(target)).toEqual(before);
    await expect(
      conversationJournal({ kind: "entry", reference: randomUUID() + "@0" }),
    ).rejects.toThrow("not found");
  } finally {
    if (previous === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = previous;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("journal conversation enforces controller, origin and local mode without a provider request", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nexus-journal-route-"));
  const previous = process.env.GW_SYNC_DATA_DIR,
    original = globalThis.fetch;
  process.env.GW_SYNC_DATA_DIR = dir;
  const config = {
    version: 1 as const,
    pairingHash: "a".repeat(64),
    signingSecret: "b".repeat(64),
  };
  try {
    await fs.writeFile(
      path.join(dir, "sync-config.json"),
      JSON.stringify(config),
    );
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      throw Error("Provider must not be contacted");
    }) as typeof fetch;
    const ask = (
      role?: "controller" | "display",
      origin = "http://localhost:3000",
      mode = "auto",
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
          body: JSON.stringify({ query: "Show my work journal", mode }),
        }),
      );
    expect((await ask()).status).toBe(401);
    expect((await ask("display")).status).toBe(403);
    expect((await ask("controller", "https://other.example")).status).toBe(403);
    expect((await ask("controller", undefined, "openai")).status).toBe(403);
    const accepted = await ask("controller");
    expect(accepted.status).toBe(200);
    const result = await accepted.json();
    expect(result.engine).toBe("Nexus work journal");
    expect(result.journalEntries).toEqual([]);
    expect(calls).toBe(0);
  } finally {
    globalThis.fetch = original;
    if (previous === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = previous;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("desktop and phone inspect a journal entry and open its hash-bound indexed note", async ({
  page,
  context,
}) => {
  await fixtureRole(context, "controller");
  const ref = randomUUID() + "@2",
    id = "a".repeat(24),
    hash = "b".repeat(64);
  const entry = {
    reference: ref,
    taskId: ref.split("@")[0],
    revision: 2,
    at: "2026-11-24T12:00:00.000Z",
    state: "saved",
    indexing: "indexed",
    workspace: "Personal",
    currentTaskLabel: "Synthetic phone checklist",
    filename: "nexus-journal-personal-" + randomUUID() + ".md",
    sha256: hash,
    bytes: 200,
    indexedFile: { id, hash },
  };
  const queries: string[] = [];
  await page.route("**/api/sync/nexus", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const body = route.request().postDataJSON();
    queries.push(body.query);
    const base = { engine: "Nexus work journal", sources: [], warnings: [] };
    return route.fulfill({
      json:
        body.query === "Show my work journal"
          ? {
              ...base,
              answer: "Recorded journal history",
              journalEntries: [entry],
            }
          : body.query.startsWith("Show journal entry")
            ? {
                ...base,
                answer: "Recorded read-back only",
                journalEntry: entry,
              }
            : {
                ...base,
                answer: "Indexed journal note fixture",
                fileRead: { id, hash, part: 1, totalParts: 1 },
              },
    });
  });
  await page.goto("/nexus");
  await openAssistant(page);
  await page
    .locator("form")
    .getByLabel("Ask Nexus", { exact: true })
    .fill("Show my work journal");
  await page
    .locator("form")
    .getByRole("button", { name: "Ask Nexus", exact: true })
    .click();
  await page
    .getByRole("button", { name: "View journal entry", exact: true })
    .click();
  await expect(
    page.getByText(
      "Current file availability is checked only when opening it.",
      { exact: false },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open indexed journal note", exact: true })
    .click();
  await expect(
    page.getByText("Indexed journal note fixture", { exact: true }),
  ).toBeVisible();
  expect(queries).toEqual([
    "Show my work journal",
    "Show journal entry " + ref,
    `Read laptop file ${id}@${hash} part 1`,
  ]);
});
