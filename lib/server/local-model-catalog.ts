import { modelIdentifier } from "../agent-router";
import type { LocalModelCatalog } from "../local-model-catalog";
import { boundedJSON } from "./agent-router";
import { configuredLocalModel } from "./nexus-store";
import { SyncError } from "./sync-store";
const normalized = (name: string) =>
  name.includes(":") ? name : name + ":latest";
export async function inspectLocalModels(
  signal: AbortSignal,
): Promise<LocalModelCatalog> {
  const configured = await configuredLocalModel();
  const timeout = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
  let data;
  try {
    timeout.throwIfAborted();
    data = await boundedJSON(
      await fetch("http://127.0.0.1:11434/api/tags", {
        method: "GET",
        redirect: "error",
        cache: "no-store",
        signal: timeout,
      }),
      500000,
    );
  } catch {
    throw new SyncError(
      503,
      "Local model catalog is unavailable. No generation, download or model change was requested.",
    );
  }
  timeout.throwIfAborted();
  if (!Array.isArray(data?.models) || data.models.length > 1000)
    throw new SyncError(503, "Local model catalog response is unsupported.");
  const found = new Map<string, LocalModelCatalog["models"][number]>();
  let rejectedEntries = 0;
  for (const item of data.models) {
    const name = modelIdentifier(item?.name);
    if (!name) {
      rejectedEntries++;
      continue;
    }
    if (found.has(name)) continue;
    found.set(name, {
      name,
      bytes:
        Number.isSafeInteger(item.size) && item.size >= 0 ? item.size : null,
      digest:
        typeof item.digest === "string" && /^[a-f0-9]{64}$/i.test(item.digest)
          ? item.digest.toLowerCase()
          : null,
      modifiedAt:
        typeof item.modified_at === "string" &&
        item.modified_at.length <= 40 &&
        Number.isFinite(Date.parse(item.modified_at))
          ? new Date(item.modified_at).toISOString()
          : null,
    });
  }
  if ((await configuredLocalModel()) !== configured)
    throw new SyncError(
      409,
      "Configured local model changed during inspection. Inspect again.",
    );
  const models = [...found.values()].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  const configuredModel = modelIdentifier(configured);
  return {
    checkedAt: new Date().toISOString(),
    configuredModel,
    configuredListed: configuredModel
      ? models.some(
          (item) => normalized(item.name) === normalized(configuredModel),
        )
      : null,
    reportedEntries: data.models.length,
    uniqueModels: models.length,
    omitted: Math.max(0, models.length - 100),
    rejectedEntries,
    models: models.slice(0, 100),
    notice:
      "Ollama-reported local catalog metadata only. Listed models are not proof of loaded state, hardware fit or inference readiness. Digests are reported, not independently verified. No generation, download or configuration change was requested.",
  };
}
