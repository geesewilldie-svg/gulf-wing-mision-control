export function reviewedWebLink(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length > 2000 ||
    /[\s\x00-\x1f\x7f]/.test(value)
  )
    throw new Error("Enter one HTTPS link without spaces or credentials.");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a complete HTTPS link.");
  }
  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password
  )
    throw new Error(
      "Only HTTPS web links without embedded usernames or passwords are supported.",
    );
  if (url.href.length > 2000)
    throw new Error("The normalized link exceeds its size limit.");
  return { url: url.href, host: url.host };
}
export function webLinkIntent(query: string): string | null {
  const text = query
    .trim()
    .replace(/^(?:hey\s+)?nexus[, ]+/i, "")
    .replace(/^please\s+/i, "");
  return (
    /^open (?:this link )?on (?:my )?laptop\s+(.+)$/i.exec(text)?.[1] ||
    /^open\s+(\S+)\s+on (?:my )?laptop$/i.exec(text)?.[1] ||
    null
  );
}
