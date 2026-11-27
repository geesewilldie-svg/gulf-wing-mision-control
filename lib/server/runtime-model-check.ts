import { randomUUID } from "node:crypto";
import type { RuntimeModelCheck } from "../runtime-model";
import { withVerifiedHubArchive } from "./hub-archive-history";
import { inspectRuntimeModelReceipt } from "./runtime-model-store";
import { inspectLocalModels } from "./local-model-catalog";
import { inspectLocalModelDetails } from "./local-model-details";
import {
  GGUF_RUNTIME_METADATA_LIMIT,
  parseGgufMetadata,
} from "../gguf-metadata";
import { SyncError } from "./sync-store";
export async function checkRuntimeModel(
  value: any,
  signal: AbortSignal,
): Promise<RuntimeModelCheck> {
  if (
    !value ||
    Array.isArray(value) ||
    Object.keys(value).length !== 4 ||
    Object.keys(value).some(
      (k) => !["action", "slot", "receiptSha256", "creationRunId"].includes(k),
    ) ||
    value.action !== "check-runtime-model" ||
    typeof value.slot !== "string" ||
    !/^asset-0\d{2}$/.test(value.slot) ||
    typeof value.receiptSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.receiptSha256) ||
    typeof value.creationRunId !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      value.creationRunId,
    )
  )
    throw new SyncError(
      400,
      "Choose an inspected source and recorded creation run. Caller model names, paths and runtime options are not accepted.",
    );
  try {
    const result = await withVerifiedHubArchive(
      value.slot,
      value.receiptSha256,
      signal,
      async (record, directory, handle, limit) => {
        const source = {
            receiptSha256: value.receiptSha256,
            sha256: record.recordedSha256,
            bytes: record.recordedBytes,
          },
          before = await inspectRuntimeModelReceipt(directory, source);
        if (
          before.state !== "recorded" ||
          before.receipt.runId !== value.creationRunId
        )
          throw new SyncError(
            409,
            "The creation receipt is missing, unsafe or changed. Inspect the archive again.",
          );
        const bounded = AbortSignal.any([limit, AbortSignal.timeout(20000)]),
          creation = before.receipt,
          catalog = await inspectLocalModels(bounded),
          current = catalog.models.find((item) => item.name === creation.alias);
        let state: RuntimeModelCheck["state"],
          details: RuntimeModelCheck["details"] = null;
        if (!current)
          state =
            catalog.omitted || catalog.rejectedEntries
              ? "coverage-incomplete"
              : "not-listed";
        else if (!current.digest) state = "identity-unavailable";
        else {
          const prefix = Buffer.alloc(
            Math.min(record.recordedBytes, GGUF_RUNTIME_METADATA_LIMIT),
          );
          let offset = 0;
          while (offset < prefix.length) {
            bounded.throwIfAborted();
            const r = await handle.read(
              prefix,
              offset,
              prefix.length - offset,
              offset,
            );
            if (!r.bytesRead) throw Error("Short metadata read");
            offset += r.bytesRead;
          }
          const metadata = parseGgufMetadata(
            prefix,
            GGUF_RUNTIME_METADATA_LIMIT,
          );
          if (!metadata.metadataComplete || !metadata.architecture)
            throw new SyncError(
              409,
              "The source metadata cannot support this model identity comparison.",
            );
          details = await inspectLocalModelDetails(
            creation.alias,
            current.digest,
            bounded,
          );
          if (
            creation.state === "created" &&
            (creation.manifestDigest !== current.digest ||
              creation.architecture !== metadata.architecture)
          )
            state = "changed";
          else if (!details.format || !details.architecture)
            state = "identity-unavailable";
          else if (
            details.format !== "gguf" ||
            details.architecture !== metadata.architecture
          )
            state = "changed";
          else
            state =
              creation.state === "created"
                ? "matches-record"
                : "present-unconfirmed";
        }
        const after = await inspectLocalModels(bounded),
          final = after.models.find((item) => item.name === creation.alias),
          again = await inspectRuntimeModelReceipt(directory, source);
        if (
          catalog.configuredModel !== after.configuredModel ||
          JSON.stringify(current ?? null) !== JSON.stringify(final ?? null) ||
          (!current &&
            (catalog.omitted !== after.omitted ||
              catalog.rejectedEntries !== after.rejectedEntries)) ||
          again.state !== "recorded" ||
          JSON.stringify(again.receipt) !== JSON.stringify(creation)
        )
          throw new SyncError(
            409,
            "The model catalog, selection or creation evidence changed during inspection. No result was accepted.",
          );
        bounded.throwIfAborted();
        return {
          checkId: randomUUID(),
          slot: value.slot,
          receiptSha256: value.receiptSha256,
          creationRunId: creation.runId,
          alias: creation.alias,
          sha256: record.recordedSha256,
          bytes: record.recordedBytes,
          recordedCreationState: creation.state,
          expectedManifestDigest: creation.manifestDigest ?? null,
          currentManifestDigest: current?.digest ?? null,
          state,
          details,
          notice:
            "Current runtime-reported catalog/metadata compared with a retained creation receipt and fully checked local source. This does not independently authenticate runtime bytes or prove inference readiness. Original receipts, selection and model data were unchanged; no creation, recovery, deletion or generation was requested.",
        };
      },
    );
    return { ...result, checkedAt: new Date().toISOString() };
  } catch (error) {
    if (signal.aborted)
      throw new SyncError(
        499,
        "Runtime model inspection cancelled. Original receipts were unchanged.",
      );
    if (error instanceof SyncError) throw error;
    throw new SyncError(
      503,
      "Runtime model inspection could not be completed safely. No model or receipt was changed.",
    );
  }
}
