export function taskIntent(
  query: string,
): { kind: "create"; request: string } | { kind: "list" } | null {
  const text = query
    .trim()
    .replace(/^(?:hey\s+)?nexus[, ]+/i, "")
    .replace(/^please\s+/i, "");
  if (
    /^(?:show|list)(?: me)? my tasks[.!?]*$/i.test(text) ||
    /^what are my tasks[?!.]*$/i.test(text)
  )
    return { kind: "list" };
  const match =
    /^(?:create|add|save) (?:a )?task(?:\s+to\s+|\s*:\s*|\s+)([\s\S]+)$/i.exec(
      text,
    );
  return match ? { kind: "create", request: match[1].trim() } : null;
}
