export type FileIntent =
  | { kind: "status" | "refresh" | "map" }
  | { kind: "read"; target: string; part: number }
  | { kind: "search"; query: string };

export function fileIntent(query: string): FileIntent | null {
  const text = query
    .trim()
    .replace(/^(?:hey\s+)?nexus[, ]+/i, "")
    .replace(/^please\s+/i, "")
    .replace(/[.!?]+$/, "");
  if (/^show (?:my )?connected folders$/i.test(text)) return { kind: "status" };
  if (/^refresh (?:my )?laptop file index$/i.test(text))
    return { kind: "refresh" };
  if (/^show (?:my )?(?:connected source map|source map)$/i.test(text))
    return { kind: "map" };
  const read = /^read laptop file (.+?)(?: part ([0-9]+))?$/i.exec(text);
  if (read)
    return {
      kind: "read",
      target: read[1].trim(),
      part: read[2] ? Number(read[2]) : 1,
    };
  const match = /^find (?:my )?laptop files (?:about|containing) (.+)$/i.exec(
    text,
  );
  if (match && match[1].trim())
    return { kind: "search", query: match[1].trim() };
  return null;
}
