export function connectionIntent(query: string) {
  const text = query
    .trim()
    .replace(/^(?:hey\s+)?nexus[, ]+/i, "")
    .replace(/^please\s+/i, "")
    .replace(/[.!?]+$/, "");
  return /^show (?:my )?(?:connections|connection setup)$/i.test(text);
}
