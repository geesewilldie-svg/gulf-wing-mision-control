import { localDetailModel } from "./local-model-details";
export type LocalModelIntent =
  | "catalog"
  | "help"
  | { kind: "details"; model: string };
export function localModelIntent(query: string): LocalModelIntent | null {
  const command = query
    .trim()
    .replace(/^(?:hey\s+)?nexus[, ]+/i, "")
    .replace(/^please\s+/i, "");
  const detail = /^inspect local model (.+)$/i.exec(command);
  if (detail)
    return localDetailModel(detail[1])
      ? { kind: "details", model: detail[1] }
      : "help";
  if (/^inspect local model(?:\s|$)/i.test(command)) return "help";
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
