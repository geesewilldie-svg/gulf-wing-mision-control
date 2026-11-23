import type { IndexedFile } from "./local-files";

// Resolve only literal wiki links inside one selected Obsidian root.
export function noteLinks(source: IndexedFile, files: IndexedFile[]) {
  const text = source.documents.map((document) => document.text).join("\n");
  const bounded = text
    .slice(0, 200000)
    .replace(/<!--[\s\S]*?(?:-->|$)/g, "")
    .replace(/^\s*(`{3,}|~{3,}).*$[\s\S]*?^\s*\1\s*$/gm, "")
    .replace(/`[^`\n]*`/g, "");
  const targets = new Map<string, IndexedFile>();
  const seen = new Set<string>();
  let unresolved = 0,
    inspected = 0;
  for (const match of bounded.matchAll(/(?<!!)\[\[([^\]\n]{1,220})\]\]/g)) {
    if (++inspected > 100) break;
    const target = match[1]
      .split("|")[0]
      .split("#")[0]
      .trim()
      .replace(/\.md$/i, "");
    if (!target || seen.has(target.toLowerCase())) continue;
    seen.add(target.toLowerCase());
    if (
      /[\\:]|^[/.]/.test(target) ||
      target
        .split("/")
        .some((part) => !part || part === ".." || part.startsWith("."))
    ) {
      unresolved++;
      continue;
    }
    const candidates = files.filter(
      (file) => file.rootId === source.rootId && /\.md$/i.test(file.name),
    );
    const exact = candidates.filter(
      (file) =>
        file.name.replace(/\.md$/i, "").toLowerCase() === target.toLowerCase(),
    );
    const matches = exact.length
      ? exact
      : target.includes("/")
        ? []
        : candidates.filter(
            (file) =>
              file.name
                .split("/")
                .at(-1)!
                .replace(/\.md$/i, "")
                .toLowerCase() === target.toLowerCase(),
          );
    if (matches.length !== 1) {
      unresolved++;
      continue;
    }
    if (matches[0].id !== source.id) targets.set(matches[0].id, matches[0]);
  }
  return {
    links: [...targets.values()]
      .slice(0, 20)
      .map((file) => ({ id: file.id, hash: file.hash, name: file.name })),
    unresolved,
    partial: text.length > 200000 || inspected > 100 || targets.size > 20,
  };
}
