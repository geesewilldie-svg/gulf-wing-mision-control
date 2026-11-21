export type FileIntent =
  | { kind: "status" | "refresh" }
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
  const match = /^find (?:my )?laptop files (?:about|containing) (.+)$/i.exec(
    text,
  );
  if (match && match[1].trim())
    return { kind: "search", query: match[1].trim() };
  return null;
}
