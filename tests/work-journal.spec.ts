import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { createTask, withStore } from "../lib/server/foundation/store";
import {
  workJournalTick,
  workJournalReceipts,
} from "../lib/server/work-journal";
import {
  enableWorkJournal,
  disableWorkJournal,
  disableMemoryVault,
  prepareMemoryVault,
  workJournalGrant,
  writeMemorySnapshot,
} from "../scripts/memory-vault-lib.mjs";
import { answerMemorySources } from "../lib/server/answer-memory-sources";
import { fixtureRole } from "./helpers/access";
async function isolated(run: (dir: string, target: string) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nexus-journal-"));
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
            id: "d".repeat(24),
            label: "Test Vault",
            kind: "obsidian",
            path: vault,
          },
        ],
      }),
    );
    const target = await prepareMemoryVault(dir, "d".repeat(24));
    await run(dir, target);
  } finally {
    if (previous === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = previous;
    await fs.rm(dir, { recursive: true, force: true });
  }
}
function completed(scope = "Personal", old = false) {
  const id = createTask({
    scope,
    mode: "plan",
    request: "Synthetic journal checklist",
  });
  withStore((db) =>
    db
      .prepare(
        "UPDATE tasks SET state='completed', output='Unverified journal artifact',updated_at=? WHERE id=?",
      )
      .run(old ? "2000-01-01T00:00:00.000Z" : new Date().toISOString(), id),
  );
  return id;
}

test("automatic journal is opt-in, ignores old work, bounds each pass and never repeats a task revision", async () =>
  isolated(async (dir, target) => {
    completed("Personal", true);
    await workJournalTick();
    expect(await fs.readdir(target)).toEqual([]);
    expect((await workJournalReceipts()).count).toBe(0);
    const since = await enableWorkJournal(dir);
    expect(await enableWorkJournal(dir)).toBe(since);
    completed();
    completed("Aviation");
    completed("Co-hosting");
    await workJournalTick();
    expect((await workJournalReceipts()).count).toBe(2);
    await workJournalTick();
    expect((await workJournalReceipts()).count).toBe(3);
    await workJournalTick();
    expect((await workJournalReceipts()).count).toBe(3);
    const batches = await fs.readdir(target);
    expect(batches).toHaveLength(3);
    for (const batch of batches) {
      const name = (await fs.readdir(path.join(target, batch)))[0];
      const text = await fs.readFile(path.join(target, batch, name), "utf8");
      expect(text).toContain("# Nexus automatic work note");
      expect(text).toContain("not individually reviewed");
      expect(text).toContain("Generated claims and code remain unverified");
      expect(
        answerMemorySources([
          { id: name, source: "Renamed.md", location: "Imported note", text },
        ]).documents,
      ).toEqual([]);
    }
    await disableWorkJournal(dir);
    expect(await workJournalGrant(dir)).toBeNull();
    completed();
    await workJournalTick();
    expect((await workJournalReceipts()).count).toBe(3);
    await writeMemorySnapshot(dir, "Manual review still permitted", "personal");
    expect(await fs.readdir(target)).toHaveLength(4);
    await disableMemoryVault(dir);
    await expect(enableWorkJournal(dir)).rejects.toThrow();
  }));

test("an uncertain published note and an interrupted claim are retained and never replayed", async () =>
  isolated(async (dir, target) => {
    await enableWorkJournal(dir);
    completed();
    let writes = 0;
    await workJournalTick(
      async (...args: Parameters<typeof writeMemorySnapshot>) => {
        writes++;
        await writeMemorySnapshot(...args);
        throw Error("Simulated lost acknowledgement after publication");
      },
    );
    expect((await workJournalReceipts()).unconfirmed).toBe(1);
    await workJournalTick();
    expect(await fs.readdir(target)).toHaveLength(1);
    expect(writes).toBe(1);
    const id = completed();
    await fs.writeFile(
      path.join(dir, "work-journal", `${id}-0.json`),
      JSON.stringify({ state: "started" }),
    );
    await workJournalTick();
    expect(await fs.readdir(target)).toHaveLength(1);
    expect((await workJournalReceipts()).unconfirmed).toBe(2);
  }));

test("automatic journal stops at its receipt limit without creating a note", async () =>
  isolated(async (dir, target) => {
    await enableWorkJournal(dir);
    completed();
    const folder = path.join(dir, "work-journal");
    await fs.mkdir(folder);
    await Promise.all(
      Array.from({ length: 500 }, () =>
        fs.writeFile(
          path.join(folder, randomUUID() + "-0.json"),
          JSON.stringify({ state: "started" }),
        ),
      ),
    );
    await workJournalTick();
    expect(await fs.readdir(target)).toEqual([]);
    expect(await workJournalReceipts()).toMatchObject({
      count: 500,
      full: true,
      unconfirmed: 500,
    });
  }));

test("orphaned capacity reservations stop publication without being reclaimed", async () =>
  isolated(async (dir, target) => {
    await enableWorkJournal(dir);
    completed();
    const folder = path.join(dir, "work-journal", "capacity");
    await fs.mkdir(folder, { recursive: true });
    await Promise.all(
      Array.from({ length: 500 }, (_, i) =>
        fs.writeFile(path.join(folder, i + ".json"), "{}"),
      ),
    );
    await workJournalTick();
    expect(await fs.readdir(target)).toEqual([]);
    expect(await workJournalReceipts()).toMatchObject({
      count: 500,
      full: true,
      unconfirmed: 500,
    });
  }));

test("journal disable takes effect before a pending destination write", async () =>
  isolated(async (dir, target) => {
    await enableWorkJournal(dir);
    completed();
    await workJournalTick(
      async (...args: Parameters<typeof writeMemorySnapshot>) => {
        await disableWorkJournal(dir);
        return writeMemorySnapshot(...args);
      },
    );
    expect(await fs.readdir(target)).toEqual([]);
    expect((await workJournalReceipts()).unconfirmed).toBe(1);
  }));

test("desktop and phone show journal status and can disable only automatic notes", async ({
  page,
  context,
}) => {
  await fixtureRole(context, "controller");
  let enabled = true;
  await page.route("**/api/sync/foundation", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const body = route.request().postDataJSON();
    if (body.op === "memory.journal.disable") enabled = false;
    else if (body.op !== "memory.vault.status") return route.continue();
    return route.fulfill({
      json: {
        state: "ready",
        label: "Test Vault",
        folder: "Nexus Memory Snapshots",
        workJournal: enabled ? "enabled" : "disabled",
        journalReceipts: { count: 2, unconfirmed: 1, full: false },
      },
    });
  });
  await page.goto("/nexus");
  await page.getByRole("button", { name: "Foundation", exact: true }).click();
  const panel = page.getByRole("region", {
    name: "Obsidian vault save connection",
  });
  await expect(panel).toContainText("Automatic work journal: enabled");
  await panel
    .getByRole("button", {
      name: "Disable automatic work journal",
      exact: true,
    })
    .click();
  await expect(panel).toContainText("Automatic work journal: off");
  await expect(panel).toContainText("Ready for reviewed saves");
  await expect(panel.getByRole("status")).toContainText(
    "Reviewed saves remain available",
  );
});

test("confirmed journal metadata recovers after a transient catalog lock without another file write", async () =>
  isolated(async (dir, target) => {
    await enableWorkJournal(dir);
    const id = completed();
    await fs.writeFile(path.join(dir, "note-versions.lock"), "held");
    await workJournalTick();
    const receiptPath = path.join(dir, "work-journal", `${id}-0.json`);
    const saved = JSON.parse(await fs.readFile(receiptPath, "utf8"));
    expect(saved).toMatchObject({ state: "saved", tracking: "pending" });
    expect(saved.trackingProof.rootIdentity).toMatch(/^[a-f0-9]{64}$/);
    const file = path.join(dir, "vault", ...saved.file.name.split("/"));
    const before = await fs.readFile(file);
    const beforeStat = await fs.stat(file);
    // The captured source version, not the later task contents, is recovered.
    withStore((db) =>
      db
        .prepare(
          "UPDATE tasks SET output='Later corrected artifact',revision=1,state='cancelled' WHERE id=?",
        )
        .run(id),
    );
    await fs.rm(path.join(dir, "note-versions.lock"));
    await workJournalTick(async () => {
      throw Error("Must not publish again");
    });
    expect(JSON.parse(await fs.readFile(receiptPath, "utf8")).tracking).toBe(
      "tracked",
    );
    expect(await fs.readFile(file)).toEqual(before);
    expect((await fs.stat(file)).mtimeMs).toBe(beforeStat.mtimeMs);
    expect(await fs.readdir(target)).toHaveLength(1);
    const catalog = JSON.parse(
      await fs.readFile(path.join(dir, "note-versions.json"), "utf8"),
    );
    expect(catalog.entries).toHaveLength(1);
    expect(catalog.entries[0].sourceVersion).toBe(
      saved.trackingProof.sourceVersion,
    );
    expect(catalog.entries[0].savedAt).toBe(saved.trackingProof.savedAt);
    await workJournalTick();
    expect(
      JSON.parse(
        await fs.readFile(path.join(dir, "note-versions.json"), "utf8"),
      ).entries,
    ).toHaveLength(1);
  }));

test("tracking recovery preserves external edits and ignores uncertain and legacy receipts", async () =>
  isolated(async (dir) => {
    await enableWorkJournal(dir);
    const id = completed();
    await fs.writeFile(path.join(dir, "note-versions.lock"), "held");
    await workJournalTick();
    const ledger = path.join(dir, "work-journal");
    const filename = path.join(ledger, `${id}-0.json`);
    const saved = JSON.parse(await fs.readFile(filename, "utf8"));
    const file = path.join(dir, "vault", ...saved.file.name.split("/"));
    await fs.writeFile(file, "External edits remain mine");
    await fs.rm(path.join(dir, "note-versions.lock"));
    await workJournalTick();
    expect(JSON.parse(await fs.readFile(filename, "utf8")).tracking).toBe(
      "pending",
    );
    expect(await fs.readFile(file, "utf8")).toBe("External edits remain mine");
    await fs.writeFile(
      filename,
      JSON.stringify({ ...saved, state: "unconfirmed" }),
    );
    await workJournalTick();
    expect(JSON.parse(await fs.readFile(filename, "utf8")).state).toBe(
      "unconfirmed",
    );
    const { trackingProof: _proof, ...legacy } = saved;
    await fs.writeFile(filename, JSON.stringify(legacy));
    await workJournalTick();
    expect(JSON.parse(await fs.readFile(filename, "utf8")).tracking).toBe(
      "pending",
    );
    await expect(
      fs.stat(path.join(dir, "note-versions.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  }));

test("tracking recovery rejects a copied file under a replacement vault and pauses when journal is disabled", async () =>
  isolated(async (dir) => {
    await enableWorkJournal(dir);
    const id = completed();
    await fs.writeFile(path.join(dir, "note-versions.lock"), "held");
    await workJournalTick();
    const filename = path.join(dir, "work-journal", `${id}-0.json`);
    const saved = JSON.parse(await fs.readFile(filename, "utf8"));
    await fs.rm(path.join(dir, "note-versions.lock"));
    await disableWorkJournal(dir);
    await workJournalTick();
    expect(JSON.parse(await fs.readFile(filename, "utf8")).tracking).toBe(
      "pending",
    );
    const replacement = path.join(dir, "replacement");
    const copy = path.join(replacement, ...saved.file.name.split("/"));
    await fs.mkdir(path.dirname(copy), { recursive: true });
    await fs.copyFile(
      path.join(dir, "vault", ...saved.file.name.split("/")),
      copy,
    );
    const rootsPath = path.join(dir, "local-folders.json");
    const roots = JSON.parse(await fs.readFile(rootsPath, "utf8"));
    roots.roots[0].path = replacement;
    await fs.writeFile(rootsPath, JSON.stringify(roots));
    // Retry the metadata through the same registration boundary: exact copied
    // bytes must not override the originally captured vault identity.
    const { trackSavedNote } = await import("../lib/server/note-versions");
    expect(
      await trackSavedNote(
        saved,
        {
          workspace: "Personal",
          kind: "work-note",
          taskId: id,
          producer: "automatic",
          sourceVersion: saved.trackingProof.sourceVersion,
        },
        saved.trackingProof,
      ),
    ).toBe("pending");
    await expect(
      fs.stat(path.join(dir, "note-versions.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  }));

test("tracking recovery processes at most two eligible receipts per journal pass", async () =>
  isolated(async (dir) => {
    await enableWorkJournal(dir);
    await fs.writeFile(path.join(dir, "note-versions.lock"), "held");
    for (let i = 0; i < 4; i++) completed();
    await workJournalTick();
    await workJournalTick();
    expect((await workJournalReceipts()).pendingTracking).toBe(4);
    await fs.rm(path.join(dir, "note-versions.lock"));
    await workJournalTick();
    expect((await workJournalReceipts()).pendingTracking).toBe(2);
    await workJournalTick();
    expect((await workJournalReceipts()).pendingTracking).toBe(0);
    expect(
      JSON.parse(
        await fs.readFile(path.join(dir, "note-versions.json"), "utf8"),
      ).entries,
    ).toHaveLength(4);
  }));
