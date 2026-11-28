import { checkLocalModel } from "./local-model-check";
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
        "Say ‘Show local models’ to read installed Ollama model metadata. This does not run, download or switch a model. Say ‘Inspect local model’ followed by the exact displayed model name for metadata details. Model names must match the catalog exactly; inference tests and selection changes remain separate. Say ‘Show saved local model checks’ to review past diagnostics without running a model. To explicitly load one model for the fixed diagnostic, say ‘Run local model check’ followed by its exact catalog name. This can use laptop RAM/CPU/GPU; no owner context is supplied.",
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
    if (intent.kind === "check") {
      const localModelCheck = await checkLocalModel(
        {
          action: "local-model-check",
          model: selected.name,
          digest: selected.digest,
          runTest: true,
        },
        signal,
      );
      signal.throwIfAborted();
      return {
        ...base,
        engine: "Nexus local model diagnostic",
        localModelCheck,
        routing: {
          mode: "local",
          selected: [],
          reason:
            "Explicit fixed local diagnostic only; no owner context, provider fallback or model-selection change.",
        },
        answer: `${localModelCheck.state === "passed" ? "The fixed local model test passed for this run." : "The local diagnostic completed, but the expected marker was not returned."} ${localModelCheck.receiptState === "saved" ? "Its metadata was saved locally." : "Its history save is unconfirmed or full; the session result is displayed. Do not rerun solely to save it."} This is not a hardware benchmark or future readiness guarantee. No default model was changed.`,
      };
    }
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
