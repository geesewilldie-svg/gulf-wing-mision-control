export type MemoryIntent =
  | {
      kind: "save";
      category: "fact" | "preference" | "instruction";
      content: string;
    }
  | { kind: "list"; category?: "preference" }
  | { kind: "correct"; target: string; content: string }
  | { kind: "forget"; target: string };
export function memoryIntent(query: string): MemoryIntent | null {
  const text = query
    .trim()
    .replace(/^(?:hey\s+)?nexus[, ]+/i, "")
    .replace(/^please\s+/i, "");
  if (
    /^(?:show|list)(?: me)? my (?:memory|memories)[.!?]*$/i.test(text) ||
    /^what do you remember about me[.!?]*$/i.test(text)
  )
    return { kind: "list" };
  if (/^(?:show|list)(?: me)? my preferences[.!?]*$/i.test(text))
    return { kind: "list", category: "preference" };
  const save =
    /^remember (?:my (preference|instruction)\s*:\s*|that\s+)([\s\S]+)$/i.exec(
      text,
    );
  if (save)
    return {
      kind: "save",
      category:
        (save[1]?.toLowerCase() as "preference" | "instruction") || "fact",
      content: save[2].trim(),
    };
  const correct =
    /^correct (?:memory (.+?)|(that memory|this memory)) to ([\s\S]+)$/i.exec(
      text.replace(/[.!?]+$/, ""),
    );
  if (correct)
    return {
      kind: "correct",
      target: correct[1] || "last",
      content: correct[3].trim(),
    };
  const forget =
    /^forget (?:memory (.+)|(that memory|this memory))[.!?]*$/i.exec(
      text.replace(/[.!?]+$/, ""),
    );
  return forget ? { kind: "forget", target: forget[1] || "last" } : null;
}
