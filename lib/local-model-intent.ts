import { localDetailModel } from "./local-model-details";
export type LocalModelIntent =
  | "catalog"
  | "help"
  | "history"
  | { kind: "details"; model: string };
export function localModelIntent(query: string): LocalModelIntent | null {
  const command = query
    .trim()
    .replace(/^(?:hey\s+)?nexus[, ]+/i, "")
    .replace(/^please\s+/i, "");
  if (
    /^(?:show|list) (?:my )?saved (?:local model checks|model diagnostics)[.!?]*$/i.test(
      command,
    )
  )
    return "history";
  if (
    /^(?:show|list) (?:my )?saved (?:local model checks|model diagnostics)(?:\s|$)/i.test(
      command,
    )
  )
    return "help";
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
