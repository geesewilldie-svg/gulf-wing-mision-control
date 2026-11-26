import { noteLinks } from "./note-links";
import type { FileSearchStatus, IndexedFile } from "./local-files";

// Folder membership and explicit note links only; never infer semantic relationships.
export function sourceMap(
  status: FileSearchStatus,
  files: IndexedFile[],
  options: { query?: string; offset?: number; focusId?: string } = {},
) {
  const query = (options.query || "").trim();
  const requestedOffset = options.offset || 0;
  const labels = new Map(status.roots.map((root) => [root.id, root.label]));
  const matching = files.filter((file) =>
    `${labels.get(file.rootId) || ""} ${file.name}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const focusIndex = options.focusId
    ? matching.findIndex((file) => file.id === options.focusId)
    : -1;
  const offset =
    focusIndex >= 0 ? Math.floor(focusIndex / 80) * 80 : requestedOffset;
  const selected = matching.slice(offset, offset + 80);
  const links = new Map(
    files
      .filter((file) =>
        status.roots.some(
          (root) => root.id === file.rootId && root.kind === "obsidian",
        ),
      )
      .map((file) => [file.id, noteLinks(file, files)]),
  );
  const values = [...links.values()];
  const incoming = new Map<string, number>();
  for (const result of values)
    for (const target of result.links)
      incoming.set(target.id, (incoming.get(target.id) || 0) + 1);
  const topHubs = files
    .filter((file) => incoming.has(file.id))
    .map((file) => ({
      id: file.id,
      name: file.name,
      folder: labels.get(file.rootId) || "Selected source",
      incomingLinks: incoming.get(file.id)!,
    }))
    .sort(
      (a, b) =>
        b.incomingLinks - a.incomingLinks ||
        (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id.localeCompare(b.id)),
    )
    .slice(0, 5);
  return {
    scannedAt: status.scannedAt,
    total: files.length,
    withheld: status.stale,
    omitted: Math.max(0, matching.length - selected.length),
    catalog: {
      query,
      offset,
      focusId: focusIndex >= 0 ? options.focusId! : null,
      topHubs,
      matched: matching.length,
      limit: 80,
      nextOffset: offset + 80 < matching.length ? offset + 80 : null,
      resolvedDirectedLinks: values.reduce(
        (total, item) => total + item.links.length,
        0,
      ),
      unresolvedTargets: values.reduce(
        (total, item) => total + item.unresolved,
        0,
      ),
      partialLinkFiles: values.filter((item) => item.partial).length,
    },
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
          noteLinks: root.kind === "obsidian" ? links.get(file.id)! : null,
        })),
    })),
  };
}
export type SourceMap = ReturnType<typeof sourceMap>;
