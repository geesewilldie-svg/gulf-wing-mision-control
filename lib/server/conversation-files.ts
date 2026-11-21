import type { FileIntent } from "../file-intent";
import { searchDocuments } from "../nexus";
import { fileSnapshot, refreshFiles } from "./local-files";

export async function conversationFiles(
  intent: FileIntent,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  if (intent.kind === "refresh") await refreshFiles();
  // Always revalidate indexed source identity, including after a fresh scan.
  const { status, files } = await fileSnapshot();
  signal?.throwIfAborted();
  const warnings = [
    status.warning,
    ...status.scans
      .filter((scan) => scan.partial)
      .map((scan) => `${scan.label}: partial index. ${scan.issues.join(" ")}`),
  ].filter((warning): warning is string => Boolean(warning));
  const sources =
    intent.kind === "search"
      ? searchDocuments(
          files.flatMap((file) => file.documents),
          intent.query,
        )
          .slice(0, 8)
          .map((document) => ({
            ...document,
            text: document.text.slice(0, 1200),
          }))
      : [];
  let answer: string;
  if (!status.roots.length)
    answer =
      "No laptop folders are connected. Choose folders on the laptop using Setup-Nexus-Folders.cmd.";
  else {
    const coverage = `${status.files} current indexed files across ${status.roots.length} selected folders. ${status.stale} changed or unavailable files withheld.`;
    if (intent.kind === "search")
      answer = sources.length
        ? `Matching passages in selected laptop files:\n${sources.map((source, i) => `[${i + 1}] ${source.source} · ${source.location}\n${source.text}`).join("\n\n")}\n\n${coverage}`
        : `No matching passages in the current selected-folder index. This does not establish that the file does not exist elsewhere. ${coverage}`;
    else
      answer = `${intent.kind === "refresh" ? "Index refresh finished. " : ""}${coverage}\nConnected folders: ${status.roots.map((root) => `${root.label} (${root.kind})`).join(", ")}.`;
    if (!status.scannedAt)
      warnings.push(
        "No saved scan is available. Ask “Refresh my laptop file index” before searching.",
      );
  }
  return {
    engine: "Nexus laptop files",
    answer,
    sources,
    warnings,
    routing: {
      mode: "local",
      selected: [],
      reason:
        "Selected-folder index only; no model or cloud provider was used. Source files were not edited.",
    },
  };
}
