export type CurrentRecordIntent =
  | { kind: "search"; query: string; allWorkspaces: boolean }
  | { kind: "help" }
  | { kind: "page"; direction: "next" | "previous" }
  | { kind: "inspect"; number: number };
export function currentRecordIntent(query: string): CurrentRecordIntent | null {
  const text = query
    .trim()
    .replace(/^(?:hey\s+)?nexus[, ]+/i, "")
    .replace(/^please\s+/i, "")
    .replace(/[.!?]+$/, "");
  const paging = /^(next|previous) current results$/i.exec(text);
  if (paging)
    return {
      kind: "page",
      direction: paging[1].toLowerCase() as "next" | "previous",
    };
  if (/^(?:next|previous) current results(?:\s|$)/i.test(text))
    return { kind: "help" };
  const inspect =
    /^inspect current result (?:number )?([a-z-]+|[0-9]{1,4})$/i.exec(text);
  if (inspect) {
    const cardinal = [
      "one",
      "two",
      "three",
      "four",
      "five",
      "six",
      "seven",
      "eight",
      "nine",
      "ten",
      "eleven",
      "twelve",
      "thirteen",
      "fourteen",
      "fifteen",
      "sixteen",
      "seventeen",
      "eighteen",
      "nineteen",
      "twenty",
    ];
    const ordinal = [
      "first",
      "second",
      "third",
      "fourth",
      "fifth",
      "sixth",
      "seventh",
      "eighth",
      "ninth",
      "tenth",
      "eleventh",
      "twelfth",
      "thirteenth",
      "fourteenth",
      "fifteenth",
      "sixteenth",
      "seventeenth",
      "eighteenth",
      "nineteenth",
      "twentieth",
    ];
    const word = inspect[1].toLowerCase();
    return {
      kind: "inspect",
      number: /^[0-9]+$/.test(word)
        ? Number(word)
        : Math.max(cardinal.indexOf(word), ordinal.indexOf(word)) + 1,
    };
  }
  if (/^inspect current result(?:\s|$)/i.test(text)) return { kind: "help" };
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
