import { noteLinks } from "./note-links";
import type { FileSearchStatus, IndexedFile } from "./local-files";

// Folder membership and explicit note links only; never infer semantic relationships.
export function sourceMap(status: FileSearchStatus, files: IndexedFile[]) {
  const selected = files.slice(0, 80);
  return {
    scannedAt: status.scannedAt,
    total: files.length,
    withheld: status.stale,
    omitted: Math.max(0, files.length - selected.length),
    folders: status.roots.map((root) => ({
      id: root.id,
      label: root.label,
      kind: root.kind,
      files: selected
        .filter((file) => file.rootId === root.id)
        .map((file) => ({
          id: file.id,
          hash: file.hash,
          name: file.name,
          sections: file.documents.length,
          noteLinks: root.kind === "obsidian" ? noteLinks(file, files) : null,
        })),
    })),
  };
}
export type SourceMap = ReturnType<typeof sourceMap>;
