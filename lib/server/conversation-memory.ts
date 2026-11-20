import type { MemoryIntent } from "@/lib/memory-intent";
import type { MemoryRecord } from "@/lib/foundation/contracts";
import {
  listConversationMemory,
  saveMemory,
  deleteMemory,
} from "./foundation/store";
import { SyncError } from "./sync-store";
export type MemoryReference = { id: string; revision: number; scope: string };
const reference = (memory: MemoryRecord): MemoryReference => ({
  id: memory.id,
  revision: memory.revision,
  scope: memory.scope,
});
const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export function conversationMemory(
  intent: MemoryIntent,
  workspace: string,
  context: unknown,
) {
  const base = {
    engine: "Nexus memory",
    sources: [],
    warnings: [],
    routing: {
      mode: "local",
      selected: [],
      reason:
        "Local owner memory only. Saving a record does not grant tools or workers permission to execute it.",
    },
  };
  const records = listConversationMemory(workspace);
  if (intent.kind === "list") {
    const matching = records.filter(
      (record) => !intent.category || record.kind === intent.category,
    );
    return {
      ...base,
      memoryChoices: matching.slice(0, 20),
      answer: matching.length
        ? `Saved ${intent.category ? "preferences" : "memory"} in ${workspace}: ` +
          matching
            .slice(0, 20)
            .map((r) => `${r.kind}: ${r.content}`)
            .join("; ") +
          ". Showing up to twenty records. Select one to correct or forget it."
        : `No saved ${intent.category ? "preferences" : "memory"} in ${workspace}. You can say “Remember that…” or “Remember my preference:” followed by what to save.`,
    };
  }
  if (intent.kind === "save") {
    const existing = records.find(
      (r) => r.kind === intent.category && r.content === intent.content.trim(),
    );
    const id =
      existing?.id ||
      saveMemory({
        kind: intent.category,
        content: intent.content,
        scope: workspace,
      });
    const saved = listConversationMemory(workspace).find((r) => r.id === id)!;
    return {
      ...base,
      memory: reference(saved),
      memoryChanged: !existing,
      answer: `${existing ? "Already saved" : "Saved"} locally in ${workspace} as a ${saved.kind}: ${saved.content.replace(/[.!?]+$/, "")}. ${existing ? "Nothing was changed." : "Active planning may pause to refresh its context."} No external provider permission was added.`,
    };
  }
  let known: MemoryReference | undefined;
  if (context !== undefined && context !== null) {
    const c = context as MemoryReference;
    if (
      !c ||
      typeof c.id !== "string" ||
      !/^[a-f0-9-]{36}$/i.test(c.id) ||
      !Number.isSafeInteger(c.revision) ||
      c.revision < 0 ||
      c.scope !== workspace
    )
      throw new SyncError(
        400,
        "Memory selection is invalid or belongs to another workspace. Select the record again.",
      );
    known = c;
  }
  const target = normalize(intent.target);
  const matching =
    intent.target === "last"
      ? records.filter((r) => r.id === known?.id)
      : records.filter(
          (r) =>
            r.id.toLowerCase() === intent.target.toLowerCase() ||
            (intent.target.length >= 8 &&
              r.id.toLowerCase().startsWith(intent.target.toLowerCase())) ||
            (target && normalize(r.content).includes(target)),
        );
  if (matching.length !== 1)
    return {
      ...base,
      memoryChoices: (matching.length ? matching : records).slice(0, 20),
      answer:
        "Select one saved memory below or name it more specifically. Nothing was changed.",
    };
  const selected = matching[0];
  const revision =
    known?.id === selected.id ? known.revision : selected.revision;
  if (intent.kind === "forget") {
    deleteMemory({ id: selected.id, revision });
    return {
      ...base,
      memoryCleared: true,
      memoryChanged: true,
      answer:
        "Removed that memory, its correction history and search entry. Active planning may pause to refresh its context. Previously saved task outputs and backups are separate and were not erased.",
    };
  }
  saveMemory({
    id: selected.id,
    revision,
    kind: selected.kind,
    scope: workspace,
    content: intent.content,
  });
  const saved = listConversationMemory(workspace).find(
    (r) => r.id === selected.id,
  )!;
  return {
    ...base,
    memory: reference(saved),
    memoryChanged: true,
    answer: `Corrected your saved ${saved.kind} in ${workspace}: ${saved.content} Active planning using the old context is invalidated; review and resume affected tasks.`,
  };
}
