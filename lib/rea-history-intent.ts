export function reaHistoryIntent(query: string): "history" | "help" | null {
  const text = query
    .trim()
    .replace(/^(?:hey\s+)?nexus[, ]+/i, "")
    .replace(/^please\s+/i, "")
    .replace(/[.!?]+$/, "");
  if (/^(?:show|list) (?:my )?saved rea (?:tests|test history)$/i.test(text))
    return "history";
  return /^(?:show|list) (?:my )?saved rea (?:tests|test history)(?:\s|$)/i.test(
    text,
  )
    ? "help"
    : null;
}
