import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { JournalIntent } from "@/lib/journal-intent";
import type { JournalReceiptView } from "@/lib/work-journal";
import { scopes } from "@/lib/foundation/contracts";
import { workJournalReceipts } from "./work-journal";
import { withStore } from "./foundation/store";
import { memoryVaultStatus } from "../../scripts/memory-vault-lib.mjs";
import { SyncError } from "./sync-store";
const receiptName =
  /^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})-(\d{1,12})\.json$/i;
async function readReceipt(
  folder: string,
  name: string,
): Promise<JournalReceiptView> {
  const match = receiptName.exec(name)!;
  const view: JournalReceiptView = {
    reference: `${match[1]}@${match[2]}`,
    taskId: match[1],
    revision: Number(match[2]),
    at: null,
    state: "unconfirmed",
    indexing: "not-recorded",
  };
  try {
    const filename = path.join(folder, name);
    const expected = await fs.lstat(filename);
    if (!expected.isFile() || expected.isSymbolicLink() || expected.size > 5000)
      return view;
    const handle = await fs.open(filename, "r");
    let entry: any;
    try {
      const stat = await handle.stat();
      if (
        stat.size > 5000 ||
        stat.ino !== expected.ino ||
        stat.dev !== expected.dev
      )
        return view;
      const buffer = Buffer.alloc(5001);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      if (bytesRead > 5000) return view;
      entry = JSON.parse(buffer.subarray(0, bytesRead).toString("utf8"));
    } finally {
      await handle.close();
    }
    if (entry.taskId !== view.taskId || entry.revision !== view.revision)
      return view;
    if (
      typeof entry.at === "string" &&
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(entry.at) &&
      Number.isFinite(Date.parse(entry.at))
    )
      view.at = entry.at;
    if (scopes.includes(entry.workspace)) view.workspace = entry.workspace;
    if (entry.state === "skipped") view.state = "skipped";
    if (
      entry.state === "saved" &&
      typeof entry.filename === "string" &&
      /^nexus-[a-z-]+[a-f0-9-]{36}\.md$/.test(entry.filename) &&
      /^[a-f0-9]{64}$/.test(entry.sha256) &&
      Number.isSafeInteger(entry.bytes) &&
      entry.bytes > 0 &&
      entry.bytes <= 1500000
    ) {
      view.state = "saved";
      view.filename = entry.filename;
      view.sha256 = entry.sha256;
      view.bytes = entry.bytes;
      if (["indexed", "pending"].includes(entry.indexing))
        view.indexing = entry.indexing;
      if (
        entry.file &&
        /^[a-f0-9]{24}$/.test(entry.file.rootId) &&
        typeof entry.file.name === "string" &&
        /^Nexus Memory Snapshots\/[a-f0-9-]{36}\/nexus-[a-z-]+[a-f0-9-]{36}\.md$/.test(
          entry.file.name,
        ) &&
        path.posix.basename(entry.file.name) === entry.filename
      ) {
        view.indexedFile = {
          id: createHash("sha256")
            .update(entry.file.rootId + ":" + entry.file.name)
            .digest("hex")
            .slice(0, 24),
          hash: entry.sha256,
        };
      }
    }
  } catch {
    /* Malformed or interrupted metadata stays unconfirmed. */
  }
  return view;
}
export async function conversationJournal(intent: JournalIntent) {
  const root = path.resolve(
    process.env.GW_SYNC_DATA_DIR || path.join(process.cwd(), ".gulf-wing"),
  );
  const folder = path.join(root, "work-journal");
  const base = {
    engine: "Nexus work journal",
    sources: [],
    warnings: [],
    routing: {
      mode: "local",
      selected: [],
      reason:
        "Saved journal receipts and local settings only. Viewing history does not save, retry, index or run a model. Recorded results do not verify current file availability or scheduler health.",
    },
  };
  let names: string[];
  try {
    names = (await fs.readdir(folder))
      .filter((name) => receiptName.test(name))
      .slice(0, 500);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") names = [];
    else
      throw new SyncError(
        503,
        "Work-journal history could not be read. No save was started.",
      );
  }
  let entries: JournalReceiptView[];
  let observedUnknown = 0;
  if (intent.kind === "entry") {
    const [id, revision] = intent.reference.split("@");
    const name = `${id}-${revision}.json`;
    if (!names.includes(name))
      throw new SyncError(404, "Journal entry not found. No save was started.");
    entries = [await readReceipt(folder, name)];
  } else {
    entries = [];
    for (const name of names) entries.push(await readReceipt(folder, name));
    observedUnknown = entries.filter(
      (entry) => entry.state === "unconfirmed",
    ).length;
    entries.sort(
      (a, b) =>
        (b.at || "").localeCompare(a.at || "") ||
        a.reference.localeCompare(b.reference),
    );
    if (intent.kind === "issues")
      entries = entries.filter(
        (entry) =>
          entry.state === "unconfirmed" || entry.indexing === "pending",
      );
    entries = entries.slice(0, 10);
  }
  if (entries.length) {
    const labels = withStore((db) =>
      db
        .prepare(
          "SELECT id,substr(request,1,160) AS label FROM tasks LIMIT 1000",
        )
        .all(),
    ) as { id: string; label: string }[];
    entries = entries.map((entry) => ({
      ...entry,
      currentTaskLabel: labels.find((row) => row.id === entry.taskId)?.label,
    }));
  }
  if (intent.kind === "entry") {
    const entry = entries[0];
    const answer =
      entry.state === "saved"
        ? `Saved and read back at the recorded time. ${entry.indexing === "indexed" ? "Indexing was recorded as complete." : entry.indexing === "pending" ? "The saved note is awaiting automatic indexing; this does not require another save." : "Indexing status was not recorded."} The current note and task claims have not been verified.`
        : entry.state === "skipped"
          ? "This journal attempt was skipped before writing a note because the task or permission changed."
          : "This save is unconfirmed or interrupted. A note may exist. Inspect the vault before taking further action; this view will not retry it.";
    return { ...base, answer, journalEntry: entry };
  }
  const [status, totals] = await Promise.all([
    memoryVaultStatus(root),
    workJournalReceipts(),
  ]);
  const setting =
    status.state === "ready" && status.workJournal === "enabled"
      ? "enabled in local settings"
      : status.state === "unavailable"
        ? "unavailable in local settings"
        : "off";
  const uncertain = Math.max(
    totals.unconfirmed,
    observedUnknown + Math.max(0, totals.count - names.length),
  );
  return {
    ...base,
    answer: `Automatic work journal: ${setting}. ${totals.count} retained receipts or reservations; ${uncertain} uncertain; ${totals.pendingIndex} saved notes awaiting indexing. ${entries.length ? `Showing ${entries.length} ${intent.kind === "issues" ? "entries needing attention" : "recent entries"} across all workspaces.` : intent.kind === "issues" ? "No selectable journal entries need attention. Uncertain reservations may lack a selectable entry." : "No journal entries are saved yet. Only new completed tasks after local opt-in are journaled."} ${totals.full ? "The retained receipt limit is reached; automatic publication is stopped. " : ""}Saved notes contain unverified work history.`,
    journalEntries: entries,
  };
}
