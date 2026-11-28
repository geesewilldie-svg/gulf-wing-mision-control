export function localModelIntent(query: string): "catalog" | "help" | null {
  const text = query
    .trim()
    .replace(/^(?:hey\s+)?nexus[, ]+/i, "")
    .replace(/^please\s+/i, "")
    .replace(/[.!?]+$/, "");
  if (/^(?:show|list) (?:my |installed )?local models$/i.test(text))
    return "catalog";
  return /^(?:show|list) (?:my |installed )?local models(?:\s|$)/i.test(text)
    ? "help"
    : null;
}
