export type CurrentRecordIntent =
  | { kind: "search"; query: string; allWorkspaces: boolean }
  | { kind: "help" };
export function currentRecordIntent(query: string): CurrentRecordIntent | null {
  const text = query
    .trim()
    .replace(/^(?:hey\s+)?nexus[, ]+/i, "")
    .replace(/^please\s+/i, "")
    .replace(/[.!?]+$/, "");
  const head = "search (?:my )?current (?:records|memory and work)";
  if (
    new RegExp(
      `^${head}(?: (?:in|across) all workspaces)?(?: for|:)?$`,
      "i",
    ).test(text)
  )
    return { kind: "help" };
  const match = new RegExp(
    `^${head}( (?:in|across) all workspaces)?(?: for\\s+|:\\s*)([\\s\\S]+)$`,
    "i",
  ).exec(text);
  if (match)
    return {
      kind: "search",
      query: match[2].trim(),
      allWorkspaces: !!match[1],
    };
  return new RegExp(`^${head}(?:\\s|$)`, "i").test(text)
    ? { kind: "help" }
    : null;
}
