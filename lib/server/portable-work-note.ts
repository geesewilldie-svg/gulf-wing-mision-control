import type { NexusTask } from "@/lib/foundation/contracts";
import { createHash } from "node:crypto";
import { quoteMemoryText } from "./portable-memory";
export function portableWorkNote(
  task: NexusTask,
  exportedAt: string,
  automatic = false,
) {
  return [
    automatic ? "# Nexus automatic work note" : "# Nexus reviewed work note",
    "",
    `Workspace: ${task.scope}`,
    `Task reference: ${task.id}`,
    `Task revision: ${task.revision}`,
    `Task mode: ${task.mode}`,
    `Recorded state: ${task.state}`,
    `Task updated (UTC): ${task.updatedAt}`,
    `Exported at (UTC): ${exportedAt}`,
    `Artifact SHA-256: ${createHash("sha256").update(task.output).digest("hex")}`,
    "",
    "Source: saved Nexus task artifact. This is task history, not an owner-stated fact or a new memory instruction. The producing model identity is not established by this export.",
    "",
    ...(automatic
      ? [
          "Creation: automatic journal under a local owner opt-in; this note was not individually reviewed.",
          "",
        ]
      : []),
    "Verification: task state and stored text only. A completed planning task does not establish that external work occurred. Generated claims and code remain unverified; reviewing or saving this note does not independently verify them or authorize execution.",
    "",
    "This is a retained snapshot, not synchronized memory. Later task changes or deletion do not update this copy. This note can be browsed explicitly; retained snapshots are excluded from automatic answer context. Existing provider-sharing permissions still apply.",
    "",
    "## Owner task request",
    "",
    quoteMemoryText(task.request),
    "",
    "## Recorded task status detail",
    "",
    quoteMemoryText(task.reason),
    "",
    "## Saved output — unverified artifact",
    "",
    quoteMemoryText(task.output),
    "",
  ].join("\n");
}
