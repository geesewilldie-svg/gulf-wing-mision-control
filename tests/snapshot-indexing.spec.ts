import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  prepareMemoryVault,
  writeMemorySnapshot,
  enableWorkJournal,
} from "../scripts/memory-vault-lib.mjs";
import {
  refreshFiles,
  indexSavedSnapshot,
  fileSnapshot,
  connectedFileDocuments,
} from "../lib/server/local-files";
import {
  workJournalTick,
  workJournalReceipts,
} from "../lib/server/work-journal";
import { createTask, withStore } from "../lib/server/foundation/store";
import { sourceMap } from "../lib/source-map";
import { readIndexedFile } from "../lib/server/read-indexed-file";
import { answerMemorySources } from "../lib/server/answer-memory-sources";
async function fixture(
  run: (dir: string, vault: string, business: string) => Promise<void>,
) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nexus-snapshot-index-"));
  const previous = process.env.GW_SYNC_DATA_DIR;
  process.env.GW_SYNC_DATA_DIR = dir;
  try {
    const vault = path.join(dir, "vault"),
      business = path.join(dir, "business");
    await fs.mkdir(vault);
    await fs.mkdir(business);
    await fs.writeFile(
      path.join(business, "Source.md"),
      "Original business evidence",
    );
    await fs.writeFile(
      path.join(dir, "local-folders.json"),
      JSON.stringify({
        version: 1,
        roots: [
          {
            id: "a".repeat(24),
            kind: "folder",
            label: "Business",
            path: business,
          },
          {
            id: "b".repeat(24),
            kind: "obsidian",
            label: "Knowledge",
            path: vault,
          },
        ],
      }),
    );
    await prepareMemoryVault(dir, "b".repeat(24));
    await run(dir, vault, business);
  } finally {
    if (previous === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = previous;
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("new saved notes join source map and exact-version reading without rescanning unrelated sources", async () =>
  fixture(async (dir, vault, business) => {
    await refreshFiles();
    const indexFile = path.join(dir, "local-file-index.json");
    const before = JSON.parse(await fs.readFile(indexFile, "utf8"));
    const saved = await writeMemorySnapshot(
      dir,
      "# Nexus owner memory\n\n> Samsung Android fixture",
      "personal",
    );
    await fs.unlink(path.join(business, "Source.md"));
    expect(await indexSavedSnapshot(saved.file, saved.sha256)).toEqual({
      state: "indexed",
    });
    const after = JSON.parse(await fs.readFile(indexFile, "utf8"));
    expect(after.scannedAt).toBe(before.scannedAt);
    expect(after.files.find((f: any) => f.id === before.files[0].id)).toEqual(
      before.files[0],
    );
    expect(after.files[0].name).toBe(saved.file.name);
    expect(await indexSavedSnapshot(saved.file, saved.sha256)).toEqual({
      state: "indexed",
    });
    expect(JSON.parse(await fs.readFile(indexFile, "utf8")).files).toHaveLength(
      2,
    );
    const current = await fileSnapshot();
    expect(current.status.stale).toBe(1);
    const map = sourceMap(current.status, current.files);
    expect(map.folders.find((f) => f.kind === "obsidian")?.files[0].name).toBe(
      saved.file.name,
    );
    const file = current.files[0];
    const opened = readIndexedFile(
      { kind: "read", target: file.id + "@" + file.hash, part: 1 },
      current.files,
      [],
    );
    expect(opened.answer).toContain("Samsung Android fixture");
    expect(
      answerMemorySources((await connectedFileDocuments()).documents).documents,
    ).toEqual([]);
    expect(
      await fs.readFile(path.join(vault, saved.file.name), "utf8"),
    ).toContain("Samsung Android fixture");
  }));

test("journal metadata can retry after index initialization without republishing the note", async () =>
  fixture(async (dir, vault) => {
    await enableWorkJournal(dir);
    const id = createTask({
      request: "Synthetic indexing checklist",
      scope: "Personal",
      mode: "plan",
    });
    withStore((db) =>
      db
        .prepare(
          "UPDATE tasks SET state='completed', output='Synthetic saved work',updated_at=? WHERE id=?",
        )
        .run(new Date().toISOString(), id),
    );
    await workJournalTick();
    expect(await workJournalReceipts()).toMatchObject({
      count: 1,
      unconfirmed: 0,
      pendingIndex: 1,
    });
    const target = path.join(vault, "Nexus Memory Snapshots");
    expect(await fs.readdir(target)).toHaveLength(1);
    await refreshFiles();
    await workJournalTick();
    expect(await workJournalReceipts()).toMatchObject({
      count: 1,
      unconfirmed: 0,
      pendingIndex: 0,
    });
    expect(await fs.readdir(target)).toHaveLength(1);
    expect(
      (await fileSnapshot()).files.some((f) =>
        f.name.includes("nexus-journal-personal"),
      ),
    ).toBe(true);
  }));

test("changed notes, changed selection and full indexes stay pending without rewriting the index", async () =>
  fixture(async (dir, vault) => {
    await refreshFiles();
    const indexFile = path.join(dir, "local-file-index.json");
    const saved = await writeMemorySnapshot(
      dir,
      "# Nexus owner memory\nOriginal fixture",
      "personal",
    );
    const original = await fs.readFile(indexFile, "utf8");
    await fs.appendFile(path.join(vault, saved.file.name), "\nOwner edit");
    expect(await indexSavedSnapshot(saved.file, saved.sha256)).toEqual({
      state: "pending",
    });
    expect(await fs.readFile(indexFile, "utf8")).toBe(original);
    const second = await writeMemorySnapshot(
      dir,
      "# Nexus owner memory\nSecond fixture",
      "personal",
    );
    const full = JSON.parse(original);
    full.files = Array.from({ length: 200 }, (_, i) => ({
      ...full.files[0],
      id: i.toString(16).padStart(24, "0"),
      name: `file-${i}.md`,
    }));
    await fs.writeFile(indexFile, JSON.stringify(full));
    expect(await indexSavedSnapshot(second.file, second.sha256)).toEqual({
      state: "pending",
    });
    expect(JSON.parse(await fs.readFile(indexFile, "utf8")).files).toHaveLength(
      200,
    );
    await fs.writeFile(indexFile, original);
    await fs.writeFile(
      path.join(dir, "local-folders.json"),
      JSON.stringify({ version: 1, roots: [] }),
    );
    expect(await indexSavedSnapshot(second.file, second.sha256)).toEqual({
      state: "pending",
    });
    expect(await fs.readFile(indexFile, "utf8")).toBe(original);
  }));

test("completed journal work appears in the existing index and galaxy without a full refresh", async () =>
  fixture(async (dir) => {
    await refreshFiles();
    await enableWorkJournal(dir);
    const id = createTask({
      request: "Automatic galaxy journal fixture",
      scope: "Personal",
      mode: "plan",
    });
    withStore((db) =>
      db
        .prepare(
          "UPDATE tasks SET state='completed', output='Automatic journal file-star fixture',updated_at=? WHERE id=?",
        )
        .run(new Date().toISOString(), id),
    );
    await workJournalTick();
    expect(await workJournalReceipts()).toMatchObject({
      count: 1,
      unconfirmed: 0,
      pendingIndex: 0,
    });
    const current = await fileSnapshot();
    const note = current.files.find((file) =>
      file.name.includes("nexus-journal-personal"),
    );
    expect(note).toBeTruthy();
    const map = sourceMap(current.status, current.files);
    expect(
      map.folders
        .find((folder) => folder.kind === "obsidian")
        ?.files.some((file) => file.id === note!.id),
    ).toBe(true);
    const read = readIndexedFile(
      { kind: "read", target: note!.id + "@" + note!.hash, part: 1 },
      current.files,
      [],
    );
    expect(read.answer).toContain("Automatic journal file-star fixture");
    const ledger = await fs.readdir(path.join(dir, "work-journal"));
    expect(ledger.filter((name) => name.endsWith(".json"))).toHaveLength(1);
  }));
