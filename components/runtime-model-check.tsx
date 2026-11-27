"use client";
import { useEffect, useRef, useState } from "react";
import type {
  RuntimeModelCheck as Check,
  RuntimeModelReceipt,
} from "@/lib/runtime-model";
import type { HubArchiveRecord } from "@/lib/hub-archive";
import LocalModelCheck from "./local-model-check";
const labels: Record<Check["state"], string> = {
  "matches-record": "Runtime identity matches the creation receipt",
  "present-unconfirmed": "Name is listed; source linkage remains unconfirmed",
  changed: "Runtime identity differs from creation evidence",
  "not-listed": "Recorded model name is not listed",
  "coverage-incomplete":
    "Catalog coverage cannot establish whether the name is listed",
  "identity-unavailable": "Model is listed; identity metadata is incomplete",
};
export default function RuntimeModelCheck({
  record,
  receipt,
  disabled,
}: {
  record: HubArchiveRecord;
  receipt: RuntimeModelReceipt;
  disabled: boolean;
}) {
  const [result, setResult] = useState<Check | null>(null),
    [busy, setBusy] = useState(false),
    [testing, setTesting] = useState(false),
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
    if (disabled || busy || testing) return;
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
          action: "check-runtime-model",
          slot: record.slot,
          receiptSha256: record.receiptSha256,
          creationRunId: receipt.runId,
        }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok)
        throw Error(data.error || "Runtime model inspection unavailable.");
      if (
        !Object.hasOwn(labels, data.state) ||
        data.slot !== record.slot ||
        data.receiptSha256 !== record.receiptSha256 ||
        data.creationRunId !== receipt.runId ||
        data.alias !== receipt.alias ||
        data.sha256 !== record.recordedSha256 ||
        data.bytes !== record.recordedBytes ||
        data.recordedCreationState !== receipt.state
      )
        throw Error(
          "The source or creation identity changed. Inspect the archive again.",
        );
      setResult(data);
    } catch (error) {
      if (!controller.signal.aborted) setError((error as Error).message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  function download() {
    if (!result) return;
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(result, null, 2)], {
          type: "application/json",
        }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = `nexus-runtime-model-check-${record.slot}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section
      className="nexus-card"
      aria-label={`Runtime model inspection ${record.slot}`}
    >
      <h4>Inspect this recorded model</h4>
      <p>
        Check the archived source and the runtime’s current catalog/metadata.
        This does not run or recreate a model; large source files may take
        several minutes.
      </p>
      <div className="nexus-actions">
        <button
          disabled={disabled || busy || testing || !record.receiptSha256}
          onClick={() => void inspect()}
        >
          Inspect runtime model · {record.slot}
        </button>
        {busy && (
          <button
            onClick={() => {
              pending.current?.abort();
              setBusy(false);
              setError(
                "Model inspection cancelled. Original receipts were unchanged.",
              );
            }}
          >
            Cancel runtime model inspection
          </button>
        )}
        {result && (
          <button disabled={disabled || busy || testing} onClick={download}>
            Download runtime model check · {record.slot}
          </button>
        )}
      </div>
      {busy && (
        <p role="status">
          Checking source integrity and current runtime identity…
        </p>
      )}
      {error && <p role="status">{error}</p>}
      {result && (
        <section
          className="nexus-hub-result"
          aria-label={`Current runtime model ${record.slot}`}
        >
          <h4>{labels[result.state]}</h4>
          <p>{result.alias}</p>
          <p>
            Checked {result.checkedAt}. Recorded creation outcome:{" "}
            {result.recordedCreationState}, unchanged.
          </p>
          {result.details && (
            <p>
              Reported architecture: {result.details.architecture ?? "Unknown"}{" "}
              · Quantization: {result.details.quantization ?? "Unknown"} ·
              Declared context: {result.details.contextLength ?? "Unknown"}
            </p>
          )}
          <p>
            Reported identity is not an independent runtime hash check or an
            inference test. No receipt was promoted or rewritten.
          </p>
          {result.state === "matches-record" &&
            result.currentManifestDigest &&
            result.details?.capabilitiesKnown &&
            result.details.capabilities.includes("completion") && (
              <LocalModelCheck
                key={result.checkId}
                model={result.alias}
                digest={result.currentManifestDigest}
                onBusyChange={setTesting}
              />
            )}
        </section>
      )}
    </section>
  );
}
