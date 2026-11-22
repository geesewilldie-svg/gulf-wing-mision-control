import type { MaintenanceAction } from "./server/maintenance";

// Match only a whole owner request, never extract commands from quoted text.
export function maintenanceIntent(query: string): MaintenanceAction | null {
  const text = query
    .trim()
    .replace(/^(?:hey\s+)?nexus[, ]+/i, "")
    .replace(/^please\s+/i, "")
    .replace(/[.!?]+$/, "");
  if (/^check (?:my )?(?:laptop|nexus) services$/i.test(text))
    return "check-connections";
  if (/^start (?:the )?missing nexus services$/i.test(text))
    return "start-services";
  return null;
}
export function operationStatusIntent(query: string): string | null {
  if (/^show (?:my )?laptop operations[.!?]*$/i.test(query.trim()))
    return "recent";
  return (
    /^(?:show|check) laptop operation ([a-f0-9]{24})[.!?]*$/i.exec(
      query.trim(),
    )?.[1] || null
  );
}
