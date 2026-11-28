import { inspectLocalModels } from "./local-model-catalog";
export async function conversationLocalModels(
  intent: "catalog" | "help",
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
  if (intent === "help")
    return {
      ...base,
      answer:
        "Say ‘Show local models’ to read installed Ollama model metadata. This does not run, download or switch a model. Use the displayed controls for separate model detail checks.",
    };
  const localModels = await inspectLocalModels(signal);
  signal.throwIfAborted();
  return {
    ...base,
    localModels,
    answer: `Ollama reported ${localModels.uniqueModels} unique local models; ${localModels.models.length} are displayed${localModels.omitted ? ` and ${localModels.omitted} are outside the display limit` : ""}. ${localModels.rejectedEntries ? `${localModels.rejectedEntries} invalid entries were withheld. ` : ""}These are catalog observations, not proof of hardware fit or inference readiness. No model was run or changed.`,
  };
}
