export type JournalIntent =
  | { kind: "recent" | "issues" }
  | { kind: "entry"; reference: string };
export function journalIntent(query: string): JournalIntent | null {
  const text = query
    .trim()
    .replace(/^(?:hey\s+)?nexus[, ]+/i, "")
    .replace(/^please\s+/i, "")
    .replace(/[.!?]+$/, "");
  if (/^(?:show|check) (?:my )?(?:automatic )?work journal issues$/i.test(text))
    return { kind: "issues" };
  if (
    /^(?:show|check) (?:my )?(?:automatic )?work journal(?: (?:history|status))?$/i.test(
      text,
    )
  )
    return { kind: "recent" };
  const entry =
    /^(?:show|check) journal entry ([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}@\d{1,12})$/i.exec(
      text,
    );
  return entry ? { kind: "entry", reference: entry[1].toLowerCase() } : null;
}
