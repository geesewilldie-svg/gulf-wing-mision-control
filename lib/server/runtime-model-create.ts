import { randomUUID } from "node:crypto";
import os from "node:os";
import { withLocalInference, boundedJSON } from "./agent-router";
import { withVerifiedHubArchive } from "./hub-archive-history";
import { inspectRuntimeStorage } from "./runtime-storage";
import { inspectLocalModels } from "./local-model-catalog";
import {
  inspectRuntimeBlobReceipt,
  beginRuntimeModelReceipt,
} from "./runtime-blob-store";
import { configuredLocalModel } from "./nexus-store";
import {
  GGUF_RUNTIME_METADATA_LIMIT,
  parseGgufMetadata,
} from "../gguf-metadata";
import type { RuntimeModelReceipt } from "../runtime-model";
import { SyncError } from "./sync-store";
const uuid = (v: unknown) =>
  typeof v === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
    v,
  );
export async function createRuntimeModel(
  value: any,
  signal: AbortSignal,
): Promise<RuntimeModelReceipt> {
  if (
    !value ||
    Array.isArray(value) ||
    Object.keys(value).length !== 7 ||
    Object.keys(value).some(
      (k) =>
        ![
          "action",
          "slot",
          "receiptSha256",
          "stageRunId",
          "expectedLicense",
          "licenseReviewed",
          "createOnly",
        ].includes(k),
    ) ||
    value.action !== "create-runtime-model" ||
    typeof value.slot !== "string" ||
    !/^asset-0\d{2}$/.test(value.slot) ||
    typeof value.receiptSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.receiptSha256) ||
    !uuid(value.stageRunId) ||
    typeof value.expectedLicense !== "string" ||
    !/^[A-Za-z0-9._-]{1,120}$/.test(value.expectedLicense) ||
    value.licenseReviewed !== true ||
    value.createOnly !== true
  )
    throw new SyncError(
      400,
      "Choose the inspected source/staging run, review its license and explicitly request creation under a new Nexus name. Caller aliases, paths, prompts and runtime options are not accepted.",
    );
  return withLocalInference(async () => {
    let journal:
        | Awaited<ReturnType<typeof beginRuntimeModelReceipt>>
        | undefined,
      receipt: RuntimeModelReceipt | undefined,
      attempted = false;
    try {
      const effect = await withVerifiedHubArchive(
        value.slot,
        value.receiptSha256,
        signal,
        async (record, directory, handle, limit) => {
          const bounded = AbortSignal.any([limit, signal]),
            configured = await configuredLocalModel();
          if (record.reportedLicense !== value.expectedLicense)
            throw new SyncError(
              409,
              "The recorded license changed. Review the source again.",
            );
          const source = {
              receiptSha256: value.receiptSha256,
              sha256: record.recordedSha256,
              bytes: record.recordedBytes,
            },
            stage = await inspectRuntimeBlobReceipt(directory, source);
          if (
            stage.state !== "recorded" ||
            stage.receipt.runId !== value.stageRunId
          )
            throw new SyncError(
              409,
              "The staging evidence changed or is unavailable. Inspect the archive again.",
            );
          const buffer = Buffer.alloc(
            Math.min(record.recordedBytes, GGUF_RUNTIME_METADATA_LIMIT),
          );
          let offset = 0;
          while (offset < buffer.length) {
            bounded.throwIfAborted();
            const r = await handle.read(
              buffer,
              offset,
              buffer.length - offset,
              offset,
            );
            if (!r.bytesRead) throw Error("Short metadata read");
            offset += r.bytesRead;
          }
          const metadata = parseGgufMetadata(
            buffer,
            GGUF_RUNTIME_METADATA_LIMIT,
          );
          if (
            !metadata.metadataComplete ||
            !metadata.architecture ||
            !/^[a-zA-Z0-9_.-]{1,100}$/.test(metadata.architecture) ||
            metadata.tensorCount < 1
          )
            throw new SyncError(
              409,
              "Creation requires complete bounded metadata, a declared architecture and nonzero tensor count. No model was created.",
            );
          const hostFree = os.freemem(),
            processFree = process.availableMemory();
          if (
            ![hostFree, processFree].every(
              (n) => Number.isSafeInteger(n) && n >= 0,
            ) ||
            Math.min(hostFree, processFree) <
              record.recordedBytes * 2 + 1024 ** 3
          )
            throw new SyncError(
              409,
              "The current free-RAM snapshot is below this import profile's buffer of two artifact sizes plus 1 GiB. No model was created.",
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
              "Runtime storage and its free-space buffer could not be observed. No model was created.",
            );
          const catalog = await inspectLocalModels(bounded);
          if (
            catalog.uniqueModels >= 100 ||
            catalog.rejectedEntries ||
            catalog.omitted
          )
            throw new SyncError(
              409,
              "The runtime catalog exceeds this creation profile's complete inspection bounds. No model was created.",
            );
          const options = {
            credentials: "omit" as const,
            redirect: "error" as const,
            cache: "no-store" as const,
            signal: bounded,
          };
          const head = await fetch(
            `http://127.0.0.1:11434/api/blobs/sha256:${record.recordedSha256}`,
            { ...options, method: "HEAD" },
          );
          await head.body?.cancel();
          if (head.status !== 200)
            throw new SyncError(
              409,
              "The runtime did not report the required blob present. No upload or model creation was attempted.",
            );
          const runId = randomUUID(),
            alias = `nexus-archive-${runId}:latest`;
          const absent = await fetch("http://127.0.0.1:11434/api/show", {
            ...options,
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: alias, verbose: false }),
          });
          await absent.body?.cancel();
          if (absent.status !== 404)
            throw new SyncError(
              409,
              "The fresh model name was not confirmed absent. No existing model is intentionally replaced.",
            );
          receipt = {
            version: 1,
            kind: "runtime-model-create",
            runId,
            slot: value.slot,
            receiptSha256: value.receiptSha256,
            stageRunId: value.stageRunId,
            sha256: record.recordedSha256,
            bytes: record.recordedBytes,
            alias,
            state: "started",
            startedAt: new Date().toISOString(),
            runtimeImported: false,
            inferenceReady: false,
          };
          try {
            journal = await beginRuntimeModelReceipt(directory, receipt);
          } catch {
            throw new SyncError(
              409,
              "A model-creation receipt already exists or could not be created safely. Inspect its retained outcome; creation is not replayed.",
            );
          }
          bounded.throwIfAborted();
          attempted = true;
          const result = await boundedJSON(
            await fetch("http://127.0.0.1:11434/api/create", {
              ...options,
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                model: alias,
                files: { "model.gguf": `sha256:${record.recordedSha256}` },
                stream: false,
              }),
            }),
            32000,
          );
          if (result?.status !== "success")
            throw Error("Creation not acknowledged");
          const shown = await boundedJSON(
            await fetch("http://127.0.0.1:11434/api/show", {
              ...options,
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ model: alias, verbose: false }),
            }),
            500000,
          );
          if (
            shown?.remote_host ||
            shown?.remote_model ||
            shown?.details?.format !== "gguf" ||
            shown?.model_info?.["general.architecture"] !==
              metadata.architecture
          )
            throw Error("Created metadata mismatch");
          const after = await inspectLocalModels(bounded),
            created = after.models.find((item) => item.name === alias),
            stageAfter = await inspectRuntimeBlobReceipt(directory, source);
          if (
            !created?.digest ||
            after.rejectedEntries ||
            after.omitted ||
            (await configuredLocalModel()) !== configured ||
            stageAfter.state !== "recorded" ||
            JSON.stringify(stageAfter.receipt) !== JSON.stringify(stage.receipt)
          )
            throw Error("Creation identity changed");
          bounded.throwIfAborted();
          return {
            manifestDigest: created.digest,
            architecture: metadata.architecture,
          };
        },
      );
      if (!journal || !receipt) throw Error("Missing creation receipt");
      const result: RuntimeModelReceipt = {
        ...receipt,
        ...effect,
        state: "created",
        finishedAt: new Date().toISOString(),
        runtimeImported: true,
        inferenceReady: false,
      };
      await journal.save(result);
      return result;
    } catch (error) {
      if (journal && receipt) {
        try {
          await journal.save({
            ...receipt,
            state: attempted
              ? "unconfirmed"
              : signal.aborted
                ? "cancelled"
                : "failed",
            finishedAt: new Date().toISOString(),
          });
        } catch {}
        throw new SyncError(
          signal.aborted ? 499 : 503,
          "Model creation was not confirmed. The generated model name or receipt may remain; inspect the archive outcome. No automatic retry, deletion, selection change or generation was attempted.",
        );
      }
      if (signal.aborted)
        throw new SyncError(
          499,
          "Model creation cancelled before an accepted result.",
        );
      if (error instanceof SyncError) throw error;
      throw new SyncError(
        503,
        "Model creation could not be prepared safely. No success was accepted.",
      );
    } finally {
      await journal?.close().catch(() => {});
    }
  });
}
