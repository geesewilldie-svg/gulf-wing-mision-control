export function reaCheckIntent(
  query: string,
): "preflight" | "protocol" | "help" | null {
  const text = query
    .trim()
    .replace(/^(?:hey\s+)?nexus[, ]+/i, "")
    .replace(/^please\s+/i, "")
    .replace(/[.!?]+$/, "");
  if (/^check rea prerequisites$/i.test(text)) return "preflight";
  if (/^test rea protocol$/i.test(text)) return "protocol";
  return /^(?:check rea prerequisites|test rea protocol)(?:\s|$)/i.test(text)
    ? "help"
    : null;
}
