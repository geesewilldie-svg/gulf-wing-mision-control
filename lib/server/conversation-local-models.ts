import { readLocalModelCheckHistory } from "./local-model-check-history";
import type { LocalModelIntent } from "../local-model-intent";
import { inspectLocalModelDetails } from "./local-model-details";
import { SyncError } from "./sync-store";
import { inspectLocalModels } from "./local-model-catalog";
export async function conversationLocalModels(
  intent: LocalModelIntent,
  signal: AbortSignal,
) {
  const base = {
    engine: "Nexus local model catalog",
    sources: [],
    warnings: [],
    resetHistory: true,
    clearRecordReferences: true,
    routing: {
      mode: "local",
      selected: [],
      reason:
        "Explicit local model metadata lookup only; no generation, download or configuration change.",
    },
  };
  if (intent === "history") {
    const localModelHistory = await readLocalModelCheckHistory(signal);
    signal.throwIfAborted();
    const summary =
      localModelHistory.state === "unavailable"
        ? "Saved model diagnostic history is unavailable; existing records were preserved."
        : localModelHistory.state === "not-created"
          ? "No saved model diagnostic history store was found."
          : `${localModelHistory.records.length} historical model checks are displayed from ${localModelHistory.validRecords} valid saved results; ${localModelHistory.withheldRecords} records were withheld.`;
    return {
      ...base,
      engine: "Nexus saved model diagnostics",
      localModelHistory,
      answer:
        summary +
        " These are historical observations, not a current readiness check. No runtime request or inference test was started.",
    };
  }
  if (intent === "help")
    return {
      ...base,
      answer:
        "Say ‘Show local models’ to read installed Ollama model metadata. This does not run, download or switch a model. Say ‘Inspect local model’ followed by the exact displayed model name for metadata details. Model names must match the catalog exactly; inference tests and selection changes remain separate. Say ‘Show saved local model checks’ to review past diagnostics without running a model.",
    };
  const localModels = await inspectLocalModels(signal);
  signal.throwIfAborted();
  if (typeof intent === "object") {
    const selected = localModels.models.find(
      (item) => item.name === intent.model,
    );
    if (!selected?.digest)
      throw new SyncError(
        409,
        "That exact model name and reported digest are not in the current displayed catalog. Say ‘Show local models’ and use an exact displayed simple local name.",
      );
    const localModelDetails = await inspectLocalModelDetails(
      selected.name,
      selected.digest,
      signal,
    );
    signal.throwIfAborted();
    return {
      ...base,
      engine: "Nexus local model details",
      localModelDetails,
      answer:
        "The requested model's runtime-reported details are displayed. Capabilities and context length are metadata, not proof of hardware fit or inference readiness. No model was run, downloaded or selected.",
    };
  }
  return {
    ...base,
    localModels,
    answer: `Ollama reported ${localModels.uniqueModels} unique local models; ${localModels.models.length} are displayed${localModels.omitted ? ` and ${localModels.omitted} are outside the display limit` : ""}. ${localModels.rejectedEntries ? `${localModels.rejectedEntries} invalid entries were withheld. ` : ""}These are catalog observations, not proof of hardware fit or inference readiness. No model was run or changed.`,
  };
}
