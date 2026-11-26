import { reviewedRecoveryToken } from "./reviewed-note-recovery";
import {
  noteSource,
  trackSavedNote,
  ownerNoteVersion,
  taskNoteVersion,
} from "./note-versions";
import path from "node:path";
import { indexSavedSnapshot } from "./local-files";
import { createHash } from "node:crypto";
import { scope } from "@/lib/foundation/contracts";
import { listConversationMemory, taskForMemoryNote } from "./foundation/store";
import { portableMemory } from "./portable-memory";
import { workJournalReceipts } from "./work-journal";
import { portableWorkNote } from "./portable-work-note";
import { SyncError } from "./sync-store";
import {
  writeMemorySnapshot,
  memoryVaultStatus,
  disableMemoryVault,
  disableWorkJournal,
} from "../../scripts/memory-vault-lib.mjs";
export async function memoryVault(body: any) {
  const dir = path.resolve(
    process.env.GW_SYNC_DATA_DIR || path.join(process.cwd(), ".gulf-wing"),
  );
  if (body.op === "memory.vault.status")
    return {
      ...(await memoryVaultStatus(dir)),
      journalReceipts: await workJournalReceipts(),
    };
  if (body.op === "memory.journal.disable") {
    try {
      await disableWorkJournal(dir);
      return {
        ...(await memoryVaultStatus(dir)),
        journalReceipts: await workJournalReceipts(),
      };
    } catch {
      throw new SyncError(
        503,
        "Automatic journal settings could not be disabled. Existing notes were preserved.",
      );
    }
  }
  if (body.op === "memory.vault.disable") {
    try {
      return await disableMemoryVault(dir);
    } catch {
      throw new SyncError(
        503,
        "Vault settings could not be disabled. Existing notes were preserved.",
      );
    }
  }
  const workspace = scope(body.scope);
  const exportedAt =
    body.op === "memory.vault.preview"
      ? new Date().toISOString()
      : body.exportedAt;
  if (
    typeof exportedAt !== "string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(exportedAt) ||
    !Number.isFinite(Date.parse(exportedAt)) ||
    Math.abs(Date.now() - Date.parse(exportedAt)) > 15 * 60 * 1000
  )
    throw new SyncError(
      409,
      "Preview expired. Review a fresh memory snapshot.",
    );
  if (
    body.kind !== undefined &&
    body.kind !== "owner-memory" &&
    body.kind !== "work-note"
  )
    throw new SyncError(
      400,
      "Choose an owner-memory snapshot or saved work note.",
    );
  const kind = body.kind || "owner-memory";
  let markdown: string;
  let sourceVersion: string | null;
  if (kind === "work-note") {
    if (
      typeof body.taskId !== "string" ||
      !/^[a-f0-9-]{36}$/i.test(body.taskId)
    )
      throw new SyncError(400, "Choose a saved task.");
    const task = taskForMemoryNote(body.taskId, workspace);
    if (!task)
      throw new SyncError(
        404,
        "Task is no longer available in this workspace.",
      );
    if (
      !task.output.trim() ||
      ["accepted", "queued", "running", "verifying"].includes(task.state)
    )
      throw new SyncError(
        409,
        "Wait for a saved task output before reviewing a work note.",
      );
    sourceVersion = taskNoteVersion(task);
    markdown = portableWorkNote(task, exportedAt);
  } else {
    const records = listConversationMemory(workspace);
    sourceVersion = ownerNoteVersion(records);
    markdown = portableMemory(records, workspace, exportedAt);
  }
  if (
    !sourceVersion ||
    sourceVersion !==
      noteSource(
        workspace,
        kind,
        kind === "work-note" ? body.taskId : undefined,
      )
  )
    throw new SyncError(
      409,
      "Memory or task changed while preparing the snapshot. Review again.",
    );
  const sha256 = createHash("sha256").update(markdown).digest("hex");
  if (body.op === "memory.vault.preview")
    return {
      markdown,
      sha256,
      exportedAt,
      workspace,
      kind,
      ...(kind === "work-note" ? { taskId: body.taskId } : {}),
    };
  if (body.confirm !== true || body.sha256 !== sha256)
    throw new SyncError(
      409,
      "Memory changed, task changed or confirmation is missing. Review a fresh snapshot before saving.",
    );
  try {
    const saved = await writeMemorySnapshot(
      path.resolve(
        process.env.GW_SYNC_DATA_DIR || path.join(process.cwd(), ".gulf-wing"),
      ),
      markdown,
      (kind === "work-note" ? "work-" : "") +
        workspace.toLowerCase().replace(/ /g, "-"),
    );
    const identity = {
      workspace,
      kind,
      sourceVersion,
      producer: "reviewed" as const,
      ...(kind === "work-note" ? { taskId: body.taskId } : {}),
    };
    const tracking = await trackSavedNote(saved, identity);
    const indexed = await indexSavedSnapshot(saved.file, saved.sha256);
    const recoveryToken =
      tracking === "pending" || indexed.state !== "indexed"
        ? await reviewedRecoveryToken(saved, identity)
        : null;
    return { ...saved, indexing: indexed.state, tracking, recoveryToken };
  } catch {
    throw new SyncError(
      503,
      "Vault save could not be confirmed. Run Setup-Nexus-Memory-Vault.cmd if setup is missing. Check the vault before retrying; an interrupted save may have left a file.",
    );
  }
}
