import type { CurrentRecordIntent } from "../current-record-intent";
import { searchCurrentRecords } from "./current-record-search";
export function conversationCurrentRecords(
  intent: Exclude<CurrentRecordIntent, { kind: "inspect" }>,
  workspace: string,
  signal: AbortSignal,
) {
  const base = {
    engine: "Nexus current records",
    sources: [],
    warnings: [],
    resetHistory: true,
    clearRecordReferences: true,
    routing: {
      mode: "local",
      selected: [],
      reason:
        "Explicit current Foundation lookup. No model, provider, file snapshot or memory/task mutation was requested.",
    },
  };
  if (intent.kind === "help")
    return {
      ...base,
      answer:
        "Say ‘Search current records for Samsung’ to search the selected workspace, or ‘Search current records in all workspaces for Samsung’. Use up to eight words and 200 characters. This searches current owner memory and task text, not laptop files or historical snapshots. After searching, say ‘Inspect current result one’ within five minutes.",
    };
  signal.throwIfAborted();
  const recordSearch = searchCurrentRecords(
    {
      action: "search-current-records",
      workspace: intent.allWorkspaces ? "all" : workspace,
      query: intent.query,
      page: 0,
    },
    signal,
  );
  const where = intent.allWorkspaces ? "all six workspaces" : workspace;
  const coverage =
    recordSearch.outsideBudgetRecords || recordSearch.truncatedRecords
      ? " Some records or text are outside the search profile."
      : "";
  return {
    ...base,
    recordSearch,
    answer: `${recordSearch.matchedRecords ? `Found ${recordSearch.matchedRecords} matching current records` : "No matches in the current search profile"} in ${where}. ${recordSearch.records.length ? "Inspect the results below; owner statements and unverified task output are labelled separately." : "Try different plain-text words or choose a different workspace."}${coverage}`,
  };
}
