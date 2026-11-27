import { inspectRuntimeStorage } from "./runtime-storage";
import os from "node:os";
import type { HubImportReview } from "../hub-import-review";
import { boundedJSON } from "./agent-router";
import { reviewVerifiedHubArchive } from "./hub-archive-history";
import { SyncError } from "./sync-store";
const memory = (n: number) => (Number.isSafeInteger(n) && n >= 0 ? n : null);
export async function reviewHubImport(
  value: any,
  signal: AbortSignal,
  storageRequested = false,
): Promise<HubImportReview> {
  if (
    !value ||
    Array.isArray(value) ||
    Object.keys(value).length !== 3 ||
    Object.keys(value).some(
      (k) => !["action", "slot", "receiptSha256"].includes(k),
    ) ||
    value.action !== "import-review" ||
    typeof value.slot !== "string" ||
    !/^asset-0\d{2}$/.test(value.slot) ||
    typeof value.receiptSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.receiptSha256)
  )
    throw new SyncError(
      400,
      "Choose an inspected archive slot and receipt identity. Import paths, URLs, model names and runtime options are not accepted by review.",
    );
  try {
    signal.throwIfAborted();
    let runtime: HubImportReview["runtime"] = {
      state: "unavailable",
      version: null,
    };
    try {
      const bounded = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
      const data = await boundedJSON(
        await fetch("http://127.0.0.1:11434/api/version", {
          method: "GET",
          credentials: "omit",
          redirect: "error",
          cache: "no-store",
          signal: bounded,
        }),
        20000,
      );
      bounded.throwIfAborted();
      if (
        typeof data?.version === "string" &&
        /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$/.test(data.version) &&
        data.version.length <= 80
      )
        runtime = { state: "version-reported", version: data.version };
    } catch {
      signal.throwIfAborted();
    }
    const { verification, record, metadata } = await reviewVerifiedHubArchive(
      value.slot,
      value.receiptSha256,
      signal,
    );
    signal.throwIfAborted();
    const runtimeStorage = storageRequested
      ? await inspectRuntimeStorage(record.recordedBytes, signal)
      : undefined;
    const blockers = [
      "Confirm Ollama’s storage location and free space.",
      "Check this model’s format is supported by the installed runtime.",
      "Test working memory requirements and a usable context size.",
      "Review the model’s license for its intended use.",
    ];
    if (runtime.state !== "version-reported")
      blockers.unshift(
        "The local runtime did not return a supported version response.",
      );
    if (!metadata.metadataComplete)
      blockers.unshift(
        "GGUF metadata coverage is partial; declared fields may be unavailable.",
      );
    if (!metadata.architecture)
      blockers.unshift("The archive's declared model architecture is unknown.");
    return {
      slot: value.slot,
      runId: record.runId,
      receiptSha256: value.receiptSha256,
      reviewedAt: new Date().toISOString(),
      repository: record.repository,
      revision: record.revision,
      sourceFilename: record.sourceFilename,
      recordedLicense: record.reportedLicense,
      bytes: record.recordedBytes,
      sha256: record.recordedSha256,
      hashCheckedAt: verification.checkedAt,
      metadata,
      runtime,
      hostMemory: {
        totalBytes: memory(os.totalmem()),
        freeBytes: memory(os.freemem()),
        sampledAt: new Date().toISOString(),
      },
      importImplemented: false,
      runtimeStorageVerified: false,
      ...(runtimeStorage ? { runtimeStorage } : {}),
      runtimeImported: false,
      inferenceReady: false,
      blockers,
      notice:
        "Read-only pre-import review: full archived-file hash agreement with the inspected local receipt, bounded declared GGUF metadata, reported runtime version and momentary host RAM. File size/free RAM do not establish working memory requirements or GPU capacity. Runtime storage, import and inference remain separate; no external source/provider request, runtime mutation or model selection change was performed.",
    };
  } catch (error) {
    if (signal.aborted)
      throw new SyncError(
        499,
        "Import review cancelled. No runtime import was attempted.",
      );
    if (error instanceof SyncError) throw error;
    throw new SyncError(
      503,
      "Import review could not be completed safely. No runtime import was attempted.",
    );
  }
}
