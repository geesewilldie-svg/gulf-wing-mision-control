import { readReaSelfTestHistory } from "./rea-self-test-history";
export async function conversationReaHistory(
  intent: "history" | "help",
  signal: AbortSignal,
) {
  const base = {
    engine: "Nexus saved REA tests",
    sources: [],
    warnings: [],
    resetHistory: true,
    clearRecordReferences: true,
    routing: {
      mode: "local",
      selected: [],
      reason:
        "Saved owned-browser diagnostic metadata only; no runtime, browser, process or provider request.",
    },
  };
  if (intent === "help")
    return {
      ...base,
      answer:
        "Say ‘Show saved REA tests’ to review the fixed Nexus-owned browser diagnostic's recorded outcomes. This does not run a test or inspect a website. General website inspection remains unconnected.",
    };
  const reaHistory = await readReaSelfTestHistory(signal);
  signal.throwIfAborted();
  const summary =
    reaHistory.state === "unavailable"
      ? "Saved REA history is unavailable; existing records were preserved."
      : reaHistory.state === "not-created"
        ? "No saved REA history store was found."
        : `${reaHistory.records.length} historical REA runs are displayed from ${reaHistory.validRecords} valid saved records; ${reaHistory.withheldRecords} records were withheld.`;
  return {
    ...base,
    reaHistory,
    answer:
      summary +
      " Recorded outcomes apply only to those runs, not current readiness. No tool or browser was started. General website inspection remains unconnected.",
  };
}
