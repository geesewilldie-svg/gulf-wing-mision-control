import { inspectLocalModels } from "./local-model-catalog";
import { boundedJSON } from "./agent-router";
import { SyncError } from "./sync-store";
import {
  localDetailModel,
  type LocalModelDetails,
} from "../local-model-details";
const gateKey = Symbol.for("nexus.local-model-details.v1");
const registry = globalThis as unknown as Record<symbol, { active: number }>;
const gate = (registry[gateKey] ||= { active: 0 });
const text = (v: unknown) =>
  typeof v === "string" &&
  v.length > 0 &&
  v.length <= 100 &&
  !/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/.test(v)
    ? v
    : null;
const integer = (v: unknown) =>
  typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : null;
export async function inspectLocalModelDetails(
  model: unknown,
  expectedDigest: unknown,
  signal: AbortSignal,
): Promise<LocalModelDetails> {
  if (
    !localDetailModel(model) ||
    typeof expectedDigest !== "string" ||
    !/^[a-f0-9]{64}$/.test(expectedDigest)
  )
    throw new SyncError(
      400,
      "Choose an inspected simple local model name and reported digest. Cloud selectors and runtime options are not accepted.",
    );
  if (gate.active >= 2)
    throw new SyncError(
      429,
      "Local model detail inspection is busy. No generation was requested.",
    );
  gate.active++;
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(12000)]);
  try {
    const before = await inspectLocalModels(bounded);
    const selected = before.models.find((item) => item.name === model);
    if (!selected || selected.digest !== expectedDigest)
      throw new SyncError(
        409,
        "The installed model or its digest changed. Inspect the local catalog again.",
      );
    bounded.throwIfAborted();
    const data = await boundedJSON(
      await fetch("http://127.0.0.1:11434/api/show", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, verbose: false }),
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        signal: bounded,
      }),
      500000,
    );
    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      data.error ||
      data.remote_host ||
      data.remote_model
    )
      throw new SyncError(
        503,
        "Model details were unavailable or described a remote model. No runtime readiness was accepted.",
      );
    const after = await inspectLocalModels(bounded);
    const current = after.models.find((item) => item.name === model);
    if (
      !current ||
      current.digest !== expectedDigest ||
      current.bytes !== selected.bytes ||
      current.modifiedAt !== selected.modifiedAt ||
      after.configuredModel !== before.configuredModel
    )
      throw new SyncError(
        409,
        "The local model or configured selection changed during inspection. Inspect the catalog again.",
      );
    bounded.throwIfAborted();
    const details =
      data.details &&
      typeof data.details === "object" &&
      !Array.isArray(data.details)
        ? data.details
        : {};
    const info =
      data.model_info &&
      typeof data.model_info === "object" &&
      !Array.isArray(data.model_info)
        ? data.model_info
        : {};
    const architecture = text(info["general.architecture"]);
    const allCapabilities: string[] =
      Array.isArray(data.capabilities) && data.capabilities.length <= 1000
        ? [
            ...new Set<string>(
              data.capabilities.filter(
                (v: unknown) =>
                  typeof v === "string" && /^[a-z][a-z0-9_-]{0,39}$/.test(v),
              ),
            ),
          ]
        : [];
    return {
      model,
      digest: expectedDigest,
      checkedAt: new Date().toISOString(),
      format: text(details.format),
      family: text(details.family),
      parameterSize: text(details.parameter_size),
      parameterCount: integer(info["general.parameter_count"]),
      quantization: text(details.quantization_level),
      architecture,
      contextLength: architecture
        ? integer(info[architecture + ".context_length"])
        : null,
      embeddingLength: architecture
        ? integer(info[architecture + ".embedding_length"])
        : null,
      capabilities: allCapabilities.slice(0, 20),
      capabilitiesKnown:
        Array.isArray(data.capabilities) &&
        data.capabilities.length <= 1000 &&
        allCapabilities.length === new Set(data.capabilities).size,
      capabilitiesOmitted: Math.max(0, allCapabilities.length - 20),
      notice:
        "Ollama-reported model details, bound to the inspected catalog digest. Context length is declared metadata, not the active request limit. Capabilities do not enable Nexus tools. No generation, download, import or selection change was requested; hardware fit and inference readiness were not tested.",
    };
  } catch (error) {
    if (signal.aborted)
      throw new SyncError(499, "Local model detail inspection cancelled.");
    if (error instanceof SyncError) throw error;
    throw new SyncError(
      signal.aborted ? 499 : 503,
      signal.aborted
        ? "Local model detail inspection cancelled."
        : "Local model details could not be inspected within the response/time limits. No generation or model change was requested.",
    );
  } finally {
    gate.active--;
  }
}
