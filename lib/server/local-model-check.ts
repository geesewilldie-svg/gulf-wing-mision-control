import { randomUUID } from "node:crypto";
import { localDetailModel } from "../local-model-details";
import type { LocalModelCheck } from "../local-model-check";
import { inspectLocalModelDetails } from "./local-model-details";
import { inspectLocalModels } from "./local-model-catalog";
import { configuredLocalModel } from "./nexus-store";
import { boundedJSON, withLocalInference } from "./agent-router";
import { SyncError } from "./sync-store";
export async function checkLocalModel(
  value: any,
  signal: AbortSignal,
): Promise<LocalModelCheck> {
  if (
    !value ||
    Array.isArray(value) ||
    Object.keys(value).length !== 4 ||
    Object.keys(value).some(
      (key) => !["action", "model", "digest", "runTest"].includes(key),
    ) ||
    value.action !== "local-model-check" ||
    value.runTest !== true ||
    !localDetailModel(value.model) ||
    typeof value.digest !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.digest)
  )
    throw new SyncError(
      400,
      "Choose an inspected local model and explicitly request the fixed diagnostic. Caller prompts and runtime options are not accepted.",
    );
  return withLocalInference(async () => {
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(45000)]),
      started = performance.now();
    try {
      const configured = await configuredLocalModel();
      const details = await inspectLocalModelDetails(
        value.model,
        value.digest,
        bounded,
      );
      if (
        !details.capabilitiesKnown ||
        !details.capabilities.includes("completion")
      )
        throw new SyncError(
          409,
          "This diagnostic requires a model reporting completion capability. No generation was requested.",
        );
      bounded.throwIfAborted();
      const data = await boundedJSON(
        await fetch("http://127.0.0.1:11434/api/generate", {
          method: "POST",
          redirect: "error",
          credentials: "omit",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          signal: bounded,
          body: JSON.stringify({
            model: value.model,
            prompt: "Reply with exactly NEXUS_OK and no other text.",
            system:
              "You are performing a local diagnostic. Follow the user's instruction exactly.",
            stream: false,
            think: false,
            keep_alive: 0,
            options: { num_predict: 8, num_ctx: 512, temperature: 0 },
          }),
        }),
        32000,
      );
      const normalize = (name: string) =>
        name.includes(":") ? name : name + ":latest";
      if (
        !data ||
        typeof data !== "object" ||
        Array.isArray(data) ||
        data.error ||
        data.done !== true ||
        typeof data.response !== "string" ||
        typeof data.model !== "string" ||
        !localDetailModel(data.model) ||
        normalize(data.model) !== normalize(value.model) ||
        data.remote_host ||
        data.remote_model
      )
        throw new SyncError(
          503,
          "The local diagnostic response was incomplete or its model identity did not match. No successful check was recorded.",
        );
      const after = await inspectLocalModels(bounded),
        selected = after.models.find((item) => item.name === value.model);
      if (
        !selected ||
        selected.digest !== value.digest ||
        (await configuredLocalModel()) !== configured
      )
        throw new SyncError(
          409,
          "The installed model or configured selection changed during the diagnostic. No result was accepted.",
        );
      bounded.throwIfAborted();
      const count =
        Number.isSafeInteger(data.eval_count) && data.eval_count >= 0
          ? data.eval_count
          : null;
      return {
        runId: randomUUID(),
        model: value.model,
        digest: value.digest,
        reportedModel: data.model,
        checkedAt: new Date().toISOString(),
        elapsedMs: Math.round(performance.now() - started),
        state:
          data.response.trim() === "NEXUS_OK" && (count === null || count <= 8)
            ? "passed"
            : "unexpected-response",
        reportedOutputTokens: count,
        notice:
          "One fixed local diagnostic completed at the recorded time. No owner memory, files, conversation or caller prompt was supplied. The runtime was asked for at most 8 output tokens and immediate unload; loaded state was not independently checked. This does not establish sustained performance, larger-context hardware fit or future readiness. No model selection or provider grant changed.",
      };
    } catch (error) {
      if (signal.aborted)
        throw new SyncError(
          499,
          "Local model check cancelled. Runtime work may already have occurred; no retry or successful result was accepted.",
        );
      if (bounded.aborted)
        throw new SyncError(
          503,
          "Local model check reached its time limit. Runtime completion/load state is uncertain; no automatic retry was attempted.",
        );
      if (error instanceof SyncError) throw error;
      throw new SyncError(
        503,
        "Local model check could not be confirmed. Runtime work may have occurred; no automatic retry or cloud fallback was attempted.",
      );
    }
  });
}
