import {
  taskNoteVersion,
  trackSavedNote,
  savedNoteRoot,
} from "./note-versions";
import fs from "node:fs/promises";
import { indexSavedSnapshot } from "./local-files";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { withStore, taskForMemoryNote } from "./foundation/store";
import { portableWorkNote } from "./portable-work-note";
import {
  workJournalGrant,
  writeMemorySnapshot,
} from "../../scripts/memory-vault-lib.mjs";
const privateDir = () =>
  path.resolve(
    process.env.GW_SYNC_DATA_DIR || path.join(process.cwd(), ".gulf-wing"),
  );
const state = globalThis as typeof globalThis & {
  nexusJournalBusy?: boolean;
  nexusJournalIndexCursor?: number;
  nexusJournalTrackingCursor?: number;
  nexusJournalTimer?: ReturnType<typeof setInterval>;
};
async function receipt(dir: string, name: string, value: unknown) {
  const temporary = path.join(dir, randomUUID() + ".tmp");
  try {
    await fs.writeFile(temporary, JSON.stringify(value), {
      flag: "wx",
      mode: 0o600,
    });
    await fs.rename(temporary, path.join(dir, name));
  } finally {
    await fs.rm(temporary, { force: true });
  }
}
async function retryNoteIndex(ledger: string) {
  let attempted = 0;
  const names = (await fs.readdir(ledger))
    .filter((name) => /^[a-f0-9-]{36}-\d+\.json$/i.test(name))
    .sort()
    .slice(0, 500);
  const offset =
    (state.nexusJournalIndexCursor || 0) % Math.max(1, names.length);
  for (let i = 0; i < names.length && attempted < 2; i++) {
    const position = (offset + i) % names.length;
    state.nexusJournalIndexCursor = (position + 1) % names.length;
    const name = names[position];
    try {
      const filename = path.join(ledger, name);
      const stat = await fs.lstat(filename);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 5000) continue;
      const entry = JSON.parse(await fs.readFile(filename, "utf8"));
      if (
        entry.state !== "saved" ||
        entry.indexing !== "pending" ||
        !entry.file
      )
        continue;
      attempted++;
      const indexed = await indexSavedSnapshot(entry.file, entry.sha256);
      if (indexed.state === "indexed")
        await receipt(ledger, name, { ...entry, indexing: "indexed" });
    } catch {
      /* Metadata may be retried; publication is never replayed. */
    }
  }
}
async function retryNoteTracking(ledger: string) {
  const names = (await fs.readdir(ledger))
    .filter((name) => /^[a-f0-9-]{36}-\d+\.json$/i.test(name))
    .sort()
    .slice(0, 500);
  const offset =
    (state.nexusJournalTrackingCursor || 0) % Math.max(1, names.length);
  let attempted = 0;
  for (let i = 0; i < names.length && attempted < 2; i++) {
    const position = (offset + i) % names.length;
    state.nexusJournalTrackingCursor = (position + 1) % names.length;
    const name = names[position];
    try {
      const filename = path.join(ledger, name);
      const stat = await fs.lstat(filename);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 5000) continue;
      const handle = await fs.open(filename, "r");
      let entry;
      try {
        const opened = await handle.stat();
        if (
          !opened.isFile() ||
          opened.ino !== stat.ino ||
          opened.dev !== stat.dev ||
          opened.size > 5000
        )
          continue;
        const bytes = Buffer.alloc(5001);
        const read = await handle.read(bytes, 0, bytes.length, 0);
        if (read.bytesRead > 5000) continue;
        entry = JSON.parse(bytes.subarray(0, read.bytesRead).toString("utf8"));
      } finally {
        await handle.close();
      }
      if (
        entry.version !== 1 ||
        !Number.isSafeInteger(entry.revision) ||
        entry.revision < 0 ||
        entry.state !== "saved" ||
        entry.tracking !== "pending" ||
        !entry.trackingProof ||
        !/^[a-f0-9]{64}$/.test(entry.trackingProof.sourceVersion) ||
        name !== `${entry.taskId}-${entry.revision}.json`
      )
        continue;
      attempted++;
      const tracking = await trackSavedNote(
        entry,
        {
          workspace: entry.workspace,
          kind: "work-note",
          taskId: entry.taskId,
          sourceVersion: entry.trackingProof.sourceVersion,
          producer: "automatic",
        },
        entry.trackingProof,
      );
      if (tracking === "tracked")
        await receipt(ledger, name, { ...entry, tracking });
    } catch {
      /* Metadata recovery never republishes a note. */
    }
  }
}
export async function workJournalTick(
  writeSnapshot: typeof writeMemorySnapshot = writeMemorySnapshot,
) {
  if (state.nexusJournalBusy) return;
  state.nexusJournalBusy = true;
  try {
    const root = privateDir();
    let since: string | null;
    try {
      since = await workJournalGrant(root);
    } catch {
      return;
    }
    if (!since) return;
    const ledger = path.join(root, "work-journal");
    await fs.mkdir(ledger, { recursive: true, mode: 0o700 });
    await retryNoteIndex(ledger);
    await retryNoteTracking(ledger);
    let count = (await fs.readdir(ledger)).filter((name) =>
      name.endsWith(".json"),
    ).length;
    if (count >= 500) return;
    const rows = withStore((db) =>
      db
        .prepare(
          "SELECT id,revision,scope FROM tasks WHERE state='completed' AND updated_at>=? AND length(trim(output))>0 ORDER BY updated_at,id LIMIT 1000",
        )
        .all(since),
    ) as { id: string; revision: number; scope: string }[];
    let dispatched = 0;
    for (const row of rows) {
      if (dispatched >= 2 || count >= 500) break;
      if (
        !/^[a-f0-9-]{36}$/i.test(row.id) ||
        !Number.isSafeInteger(row.revision) ||
        row.revision < 0
      )
        continue;
      const name = `${row.id}-${row.revision}.json`;
      const claim = {
        version: 1,
        taskId: row.id,
        revision: row.revision,
        workspace: row.scope,
        at: new Date().toISOString(),
        state: "started",
      };
      try {
        await fs.lstat(path.join(ledger, name));
        continue;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      const slots = path.join(ledger, "capacity");
      await fs.mkdir(slots, { recursive: true, mode: 0o700 });
      let reserved: string | null = null;
      for (let i = 0; i < 500; i++) {
        const slot = path.join(slots, String(i) + ".json");
        try {
          await fs.writeFile(slot, JSON.stringify(claim), {
            flag: "wx",
            mode: 0o600,
          });
          reserved = slot;
          break;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        }
      }
      if (!reserved) break;
      try {
        await fs.writeFile(path.join(ledger, name), JSON.stringify(claim), {
          flag: "wx",
          mode: 0o600,
        });
      } catch (error) {
        // This process owns the capacity slot; a competing task claim owns a
        // different one. No destination write has happened yet.
        await fs.rm(reserved, { force: true });
        if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
        throw error;
      }
      // Claim exists before any destination write. Crash/unknown claims are
      // deliberately retained and never replayed, even after a restart.
      count++;
      dispatched++;
      try {
        const task = taskForMemoryNote(row.id, row.scope);
        if (
          !task ||
          task.revision !== row.revision ||
          task.state !== "completed" ||
          task.updatedAt < since ||
          !task.output.trim()
        ) {
          await receipt(ledger, name, { ...claim, state: "skipped" });
          continue;
        }
        if ((await workJournalGrant(root)) !== since) {
          await receipt(ledger, name, { ...claim, state: "skipped" });
          break;
        }
        const sourceVersion = taskNoteVersion(task);
        const saved = await writeSnapshot(
          root,
          portableWorkNote(task, claim.at, true),
          "journal-" + task.scope.toLowerCase().replace(/ /g, "-"),
          since,
        );
        const binding = await savedNoteRoot(saved);
        const trackingProof = binding
          ? {
              rootIdentity: binding,
              sourceVersion,
              savedAt: new Date().toISOString(),
            }
          : null;
        const tracking = await trackSavedNote(
          saved,
          {
            workspace: task.scope,
            kind: "work-note",
            taskId: task.id,
            sourceVersion,
            producer: "automatic",
          },
          trackingProof || undefined,
        );
        const confirmed = {
          ...claim,
          state: "saved",
          ...saved,
          indexing: "pending",
          tracking,
          trackingProof,
        };
        await receipt(ledger, name, confirmed);
        const indexed = await indexSavedSnapshot(saved.file, saved.sha256);
        if (indexed.state === "indexed")
          await receipt(ledger, name, {
            ...confirmed,
            indexing: "indexed",
          }).catch(() => {});
      } catch {
        // Never retry a possibly published note. A receipt-write failure leaves
        // the initial claim, which is equally non-replayable.
        await receipt(ledger, name, { ...claim, state: "unconfirmed" }).catch(
          () => {},
        );
      }
    }
  } finally {
    state.nexusJournalBusy = false;
  }
}
export async function workJournalReceipts() {
  const folder = path.join(privateDir(), "work-journal");
  let names: string[];
  try {
    names = await fs.readdir(folder);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return {
        count: 0,
        unconfirmed: 0,
        full: false,
        pendingIndex: 0,
        pendingTracking: 0,
      };
    throw error;
  }
  names = names.filter((name) => /^[a-f0-9-]{36}-\d+\.json$/i.test(name));
  let unknown = 0,
    pendingIndex = 0,
    pendingTracking = 0;
  for (const name of names.slice(0, 500)) {
    try {
      const filename = path.join(folder, name);
      const stat = await fs.lstat(filename);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 5000)
        throw Error();
      const entry = JSON.parse(await fs.readFile(filename, "utf8"));
      if (!["saved", "skipped"].includes(entry.state)) unknown++;
      if (entry.state === "saved" && entry.tracking === "pending")
        pendingTracking++;
      if (entry.state === "saved" && entry.indexing === "pending")
        pendingIndex++;
    } catch {
      unknown++;
    }
  }
  let reserved = 0;
  try {
    reserved = (await fs.readdir(path.join(folder, "capacity"))).filter(
      (name) => /^\d+\.json$/.test(name),
    ).length;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  // Orphaned capacity reservations are conservative unknown outcomes too.
  return {
    pendingIndex,
    pendingTracking,
    count: Math.max(names.length, reserved),
    unconfirmed: unknown + Math.max(0, reserved - names.length),
    full: Math.max(names.length, reserved) >= 500,
  };
}
export function startWorkJournal() {
  if (state.nexusJournalTimer) return;
  state.nexusJournalTimer = setInterval(() => {
    void workJournalTick().catch(() => {});
  }, 10000);
  state.nexusJournalTimer.unref();
}
