import { randomUUID } from "node:crypto";
import type { RuntimeBlobCheck } from "../runtime-blob";
import { withVerifiedHubArchive } from "./hub-archive-history";
import { inspectRuntimeBlobReceipt } from "./runtime-blob-store";
import { SyncError } from "./sync-store";
export async function checkRuntimeBlob(
  value: any,
  signal: AbortSignal,
): Promise<RuntimeBlobCheck> {
  if (
    !value ||
    Array.isArray(value) ||
    Object.keys(value).length !== 4 ||
    Object.keys(value).some(
      (k) => !["action", "slot", "receiptSha256", "stageRunId"].includes(k),
    ) ||
    value.action !== "check-runtime-blob" ||
    typeof value.slot !== "string" ||
    !/^asset-0\d{2}$/.test(value.slot) ||
    typeof value.receiptSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.receiptSha256) ||
    typeof value.stageRunId !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      value.stageRunId,
    )
  )
    throw new SyncError(
      400,
      "Choose an inspected source and recorded staging run. Paths, URLs and upload options are not accepted.",
    );
  try {
    const result = await withVerifiedHubArchive(
      value.slot,
      value.receiptSha256,
      signal,
      async (record, directory, _handle, limit) => {
        const source = {
            receiptSha256: value.receiptSha256,
            sha256: record.recordedSha256,
            bytes: record.recordedBytes,
          },
          before = await inspectRuntimeBlobReceipt(directory, source);
        if (
          before.state !== "recorded" ||
          before.receipt.runId !== value.stageRunId
        )
          throw new SyncError(
            409,
            "The staging receipt is missing, unsafe or changed. Inspect the archive again.",
          );
        const bounded = AbortSignal.any([limit, AbortSignal.timeout(5000)]);
        let status: number;
        try {
          bounded.throwIfAborted();
          const response = await fetch(
            `http://127.0.0.1:11434/api/blobs/sha256:${record.recordedSha256}`,
            {
              method: "HEAD",
              credentials: "omit",
              redirect: "error",
              cache: "no-store",
              signal: bounded,
            },
          );
          status = response.status;
          await response.body?.cancel();
          bounded.throwIfAborted();
        } catch {
          if (signal.aborted)
            throw new SyncError(499, "Runtime blob check cancelled.");
          throw new SyncError(
            503,
            "The local runtime presence check could not be completed. No missing/present result was accepted.",
          );
        }
        if (status !== 200 && status !== 404)
          throw new SyncError(
            503,
            "The runtime did not return a supported presence response. No upload or retry was attempted.",
          );
        const after = await inspectRuntimeBlobReceipt(directory, source);
        if (
          after.state !== "recorded" ||
          JSON.stringify(after.receipt) !== JSON.stringify(before.receipt)
        )
          throw new SyncError(
            409,
            "The staging receipt changed during the check. No result was accepted.",
          );
        return {
          checkId: randomUUID(),
          slot: value.slot,
          receiptSha256: value.receiptSha256,
          stageRunId: value.stageRunId,
          sha256: record.recordedSha256,
          bytes: record.recordedBytes,
          recordedStageState: before.receipt.state,
          state:
            status === 200
              ? ("present-reported" as const)
              : ("missing-reported" as const),
          runtimeImported: false as const,
          inferenceReady: false as const,
          notice:
            "Current runtime-reported blob presence after full local archive hash agreement. A presence response does not independently verify stored runtime bytes, resolve an older upload outcome or establish that a model exists or is runnable. Original archive/staging receipts were unchanged. No upload, retry, cleanup, model creation or generation was requested.",
        };
      },
    );
    return { ...result, checkedAt: new Date().toISOString() };
  } catch (error) {
    if (signal.aborted)
      throw new SyncError(
        499,
        "Runtime blob check cancelled. No staging receipt was changed.",
      );
    if (error instanceof SyncError) throw error;
    throw new SyncError(
      503,
      "Runtime blob presence could not be inspected safely. No staging receipt was changed.",
    );
  }
}
