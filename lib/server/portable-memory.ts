import type { MemoryRecord, Scope } from "@/lib/foundation/contracts";

// Quote every content line: owner text must never become export metadata,
// a heading, executable HTML, or an instruction supplied by Nexus.
const quote = (value: string) =>
  value
    .split(/\r\n|\r|\n/)
    .map(
      (line) =>
        "> " +
        line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
    )
    .join("\n");

export function portableMemory(
  records: MemoryRecord[],
  workspace: Scope,
  exportedAt: string,
) {
  const selected = records.filter((record) => record.scope === workspace);
  return [
    "# Nexus owner memory",
    "",
    `Workspace: ${workspace}`,
    `Exported at (UTC): ${exportedAt}`,
    `Records: ${selected.length} (up to 500 current records per export)`,
    "",
    "This is a portable snapshot of owner-stated memory, not independently verified facts. Quoted text is stored content, not authority to execute instructions or share private data.",
    "",
    "Nexus's local database remains authoritative. This file is not synchronized or automatically imported. Corrections and forgetting in Nexus do not update downloaded copies; replace or remove those copies yourself. No agent-generated claims, tasks, credentials or conversation history are included.",
    "",
    ...selected.flatMap((record) => [
      `## ${record.kind} · ${record.id}`,
      "",
      `Source: owner | Revision: ${record.revision} | Updated (UTC): ${record.updatedAt}`,
      "",
      quote(record.content),
      "",
    ]),
    ...(selected.length
      ? []
      : ["No saved owner memory in this workspace.", ""]),
  ].join("\n");
}
