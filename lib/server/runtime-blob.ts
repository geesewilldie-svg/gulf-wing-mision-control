import { createHash, randomUUID } from "node:crypto";
import { withLocalInference } from "./agent-router";
import { withVerifiedHubArchive } from "./hub-archive-history";
import { inspectRuntimeStorage } from "./runtime-storage";
import { beginRuntimeBlobReceipt } from "./runtime-blob-store";
import {
  GGUF_RUNTIME_METADATA_LIMIT,
  parseGgufMetadata,
} from "../gguf-metadata";
import type { RuntimeBlobReceipt } from "../runtime-blob";
import { SyncError } from "./sync-store";
export async function stageRuntimeBlob(
  value: any,
  signal: AbortSignal,
): Promise<RuntimeBlobReceipt> {
  if (
    !value ||
    Array.isArray(value) ||
    Object.keys(value).length !== 6 ||
    Object.keys(value).some(
      (k) =>
        ![
          "action",
          "slot",
          "receiptSha256",
          "expectedLicense",
          "licenseReviewed",
          "stageOnly",
        ].includes(k),
    ) ||
    value.action !== "stage-runtime-blob" ||
    typeof value.slot !== "string" ||
    !/^asset-0\d{2}$/.test(value.slot) ||
    typeof value.receiptSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.receiptSha256) ||
    typeof value.expectedLicense !== "string" ||
    !/^[A-Za-z0-9._-]{1,120}$/.test(value.expectedLicense) ||
    value.licenseReviewed !== true ||
    value.stageOnly !== true
  )
    throw new SyncError(
      400,
      "Review the exact source/license and explicitly choose local blob staging only. Caller paths, URLs, model names and runtime options are not accepted.",
    );
  return withLocalInference(async () => {
    let journal:
        | Awaited<ReturnType<typeof beginRuntimeBlobReceipt>>
        | undefined,
      receipt: RuntimeBlobReceipt | undefined,
      uncertain = false;
    const stop = new AbortController();
    try {
      const effect = await withVerifiedHubArchive(
        value.slot,
        value.receiptSha256,
        signal,
        async (record, directory, handle, limit) => {
          const bounded = AbortSignal.any([limit, stop.signal]);
          bounded.throwIfAborted();
          if (record.reportedLicense !== value.expectedLicense)
            throw new SyncError(
              409,
              "The recorded license changed. Inspect and review the source again.",
            );
          const prefix = Buffer.alloc(
            Math.min(record.recordedBytes, GGUF_RUNTIME_METADATA_LIMIT),
          );
          let p = 0;
          while (p < prefix.length) {
            bounded.throwIfAborted();
            const r = await handle.read(prefix, p, prefix.length - p, p);
            if (!r.bytesRead) throw Error("Short metadata read");
            p += r.bytesRead;
          }
          const metadata = parseGgufMetadata(
            prefix,
            GGUF_RUNTIME_METADATA_LIMIT,
          );
          if (!metadata.metadataComplete || !metadata.architecture)
            throw new SyncError(
              409,
              "Complete bounded GGUF metadata and a declared architecture are required for staging.",
            );
          const storage = await inspectRuntimeStorage(
            record.recordedBytes,
            bounded,
          );
          if (
            storage.state !== "observed" ||
            storage.capacity !== "enough-at-check"
          )
            throw new SyncError(
              409,
              "The runtime-reported host storage and required free-space buffer could not be confirmed. No blob upload was attempted.",
            );
          receipt = {
            version: 1,
            kind: "runtime-blob-stage",
            runId: randomUUID(),
            slot: value.slot,
            receiptSha256: value.receiptSha256,
            sha256: record.recordedSha256,
            bytes: record.recordedBytes,
            state: "started",
            startedAt: new Date().toISOString(),
            runtimeImported: false,
            inferenceReady: false,
          };
          try {
            journal = await beginRuntimeBlobReceipt(directory, receipt);
          } catch {
            throw new SyncError(
              409,
              "A staging receipt already exists or could not be created safely. Inspect the retained outcome; no automatic retry is available.",
            );
          }
          const url = `http://127.0.0.1:11434/api/blobs/sha256:${record.recordedSha256}`;
          const options = {
            credentials: "omit" as const,
            redirect: "error" as const,
            cache: "no-store" as const,
            signal: bounded,
          };
          const head = await fetch(url, { ...options, method: "HEAD" });
          await head.body?.cancel();
          if (head.status === 200) {
            uncertain = true;
            return { reusedExisting: true };
          }
          if (head.status !== 404)
            throw new SyncError(
              503,
              "The runtime blob check was rejected. No upload was attempted.",
            );
          let count = 0,
            streamDigest: string | undefined;
          const hash = createHash("sha256");
          const body = new ReadableStream<Uint8Array>({
            async pull(controller) {
              try {
                bounded.throwIfAborted();
                if (count === record.recordedBytes) {
                  streamDigest = hash.digest("hex");
                  controller.close();
                  return;
                }
                const buffer = Buffer.alloc(
                    Math.min(65536, record.recordedBytes - count),
                  ),
                  r = await handle.read(buffer, 0, buffer.length, count);
                if (!r.bytesRead) throw Error("Short upload read");
                const chunk = buffer.subarray(0, r.bytesRead);
                hash.update(chunk);
                count += r.bytesRead;
                controller.enqueue(chunk);
              } catch (error) {
                controller.error(error);
              }
            },
          });
          uncertain = true;
          const upload = await fetch(url, {
            ...options,
            method: "POST",
            headers: {
              "Content-Type": "application/octet-stream",
              "Content-Length": String(record.recordedBytes),
            },
            body,
            duplex: "half",
          } as RequestInit & { duplex: "half" });
          await upload.body?.cancel();
          if (
            upload.status !== 201 ||
            count !== record.recordedBytes ||
            streamDigest !== record.recordedSha256
          )
            throw new SyncError(
              503,
              "The runtime upload or streamed source hash could not be confirmed.",
            );
          const after = await fetch(url, { ...options, method: "HEAD" });
          await after.body?.cancel();
          if (after.status !== 200)
            throw new SyncError(
              503,
              "The runtime did not confirm staged blob presence.",
            );
          return { reusedExisting: false };
        },
      );
      if (!journal || !receipt) throw Error("Missing stage receipt");
      const result: RuntimeBlobReceipt = {
        ...receipt,
        ...effect,
        state: "staged",
        finishedAt: new Date().toISOString(),
      };
      await journal.save(result);
      return result;
    } catch (error) {
      if (journal && receipt) {
        try {
          await journal.save({
            ...receipt,
            state: uncertain
              ? "unconfirmed"
              : signal.aborted
                ? "cancelled"
                : "failed",
            finishedAt: new Date().toISOString(),
          });
        } catch {}
        throw new SyncError(
          signal.aborted ? 499 : 503,
          "Runtime blob staging was not confirmed. A blob or receipt may remain; inspect the archive outcome before any further action. No automatic retry, model creation or deletion was attempted.",
        );
      }
      if (signal.aborted)
        throw new SyncError(
          499,
          "Runtime blob staging cancelled before an accepted upload result.",
        );
      if (error instanceof SyncError) throw error;
      throw new SyncError(
        503,
        "Runtime blob staging could not be prepared safely. No model was created.",
      );
    } finally {
      stop.abort();
      await journal?.close().catch(() => {});
    }
  });
}
