"use client";
import { useEffect, useRef, useState } from "react";
import type { GgufMetadata } from "@/lib/gguf-metadata";
import type { HubArchiveRecord } from "@/lib/hub-archive";
export default function HubArchiveMetadata({
  record,
  disabled,
}: {
  record: HubArchiveRecord;
  disabled: boolean;
}) {
  const [result, setResult] = useState<{
    metadata: GgufMetadata;
    notice: string;
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (disabled) {
      pending.current?.abort();
      setResult(null);
      setError("");
      setBusy(false);
    }
  }, [disabled]);
  async function inspect() {
    if (disabled || busy) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setResult(null);
    setError("");
    try {
      const response = await fetch("/api/sync/models/hub/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "metadata",
          slot: record.slot,
          receiptSha256: record.receiptSha256,
        }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok)
        throw Error(data.error || "Metadata inspection unavailable.");
      if (
        data.slot !== record.slot ||
        data.runId !== record.runId ||
        data.receiptSha256 !== record.receiptSha256
      )
        throw Error("The record changed. Inspect the archive again.");
      setResult(data);
    } catch (error) {
      if (!controller.signal.aborted) setError((error as Error).message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <section className="nexus-card" aria-label={`GGUF metadata ${record.slot}`}>
      <h4>Declared model metadata</h4>
      <p>
        Read up to 1 MiB of the local GGUF header and metadata. This does not
        check model tensors, hash the whole file, test hardware fit or import a
        model.
      </p>
      <div className="nexus-actions">
        <button
          disabled={disabled || busy || !record.receiptSha256}
          onClick={() => void inspect()}
        >
          Inspect GGUF metadata · {record.slot}
        </button>
        {busy && (
          <button
            onClick={() => {
              pending.current?.abort();
              setBusy(false);
              setError("Metadata inspection cancelled.");
            }}
          >
            Cancel metadata inspection
          </button>
        )}
      </div>
      {busy && <p role="status">Reading bounded local metadata…</p>}
      {error && <p role="status">{error}</p>}
      {result && (
        <section
          className="nexus-hub-result"
          aria-label={`GGUF metadata result ${record.slot}`}
        >
          <p>{result.notice}</p>
          <dl className="nexus-source-metadata">
            {[
              ["GGUF version", result.metadata.version],
              ["Declared model name", result.metadata.modelName ?? "Unknown"],
              [
                "Declared architecture",
                result.metadata.architecture ?? "Unknown",
              ],
              [
                "Declared context length",
                result.metadata.contextLength ?? "Unknown",
              ],
              [
                "Declared embedding length",
                result.metadata.embeddingLength ?? "Unknown",
              ],
              ["Declared block count", result.metadata.blockCount ?? "Unknown"],
              ["Declared tensors (not inspected)", result.metadata.tensorCount],
              [
                "Metadata entries read",
                `${result.metadata.metadataRead} of ${result.metadata.metadataCount}`,
              ],
              [
                "Metadata coverage",
                result.metadata.metadataComplete
                  ? "All declared metadata entries read; tensor data not inspected"
                  : "Partial — prefix limit or truncated metadata; missing fields stay unknown",
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p>Readiness: not tested. No runtime import or activation.</p>
        </section>
      )}
    </section>
  );
}
