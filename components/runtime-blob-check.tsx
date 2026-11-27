"use client";
import RuntimeModelCreate from "./runtime-model-create";
import { useEffect, useRef, useState } from "react";
import type { HubArchiveRecord } from "@/lib/hub-archive";
import type {
  RuntimeBlobReceipt,
  RuntimeBlobCheck as Check,
} from "@/lib/runtime-blob";
export default function RuntimeBlobCheck({
  record,
  receipt,
  disabled,
}: {
  record: HubArchiveRecord;
  receipt: RuntimeBlobReceipt;
  disabled: boolean;
}) {
  const [result, setResult] = useState<Check | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
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
  async function check() {
    if (disabled || busy) return;
    const controller = new AbortController();
    pending.current = controller;
    setResult(null);
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/sync/models/hub/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "check-runtime-blob",
          slot: record.slot,
          receiptSha256: record.receiptSha256,
          stageRunId: receipt.runId,
        }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok)
        throw Error(data.error || "Current runtime presence unavailable.");
      if (
        !["present-reported", "missing-reported"].includes(data.state) ||
        data.slot !== record.slot ||
        data.receiptSha256 !== record.receiptSha256 ||
        data.stageRunId !== receipt.runId ||
        data.sha256 !== record.recordedSha256 ||
        data.bytes !== record.recordedBytes ||
        data.recordedStageState !== receipt.state
      )
        throw Error(
          "The source or staging identity changed. Inspect the archive again.",
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
    a.download = `nexus-runtime-blob-check-${record.slot}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section
      className="nexus-card"
      aria-label={`Runtime presence check ${record.slot}`}
    >
      <h4>Check current runtime blob presence</h4>
      <p>
        Hash the archived file again and ask local Ollama whether this blob is
        present. Large files may take several minutes. This never retries an
        upload or changes the recorded staging outcome.
      </p>
      <div className="nexus-actions">
        <button
          disabled={disabled || busy || creating || !record.receiptSha256}
          onClick={() => void check()}
        >
          Check runtime blob · {record.slot}
        </button>
        {busy && (
          <button
            onClick={() => {
              pending.current?.abort();
              setBusy(false);
              setError(
                "Presence check cancelled. The staging receipt is unchanged.",
              );
            }}
          >
            Cancel runtime blob check
          </button>
        )}
        {result && (
          <button disabled={disabled || busy || creating} onClick={download}>
            Download runtime blob check · {record.slot}
          </button>
        )}
      </div>
      {busy && (
        <p role="status">
          Checking archive integrity and current runtime presence…
        </p>
      )}
      {error && <p role="status">{error}</p>}
      {result && (
        <section
          className="nexus-hub-result"
          aria-label={`Current runtime presence ${record.slot}`}
        >
          <h4>
            {result.state === "present-reported"
              ? "Runtime reports blob present"
              : "Runtime reports blob missing"}
          </h4>
          <p>
            Checked {result.checkedAt}. Original staging outcome:{" "}
            {result.recordedStageState}, unchanged.
          </p>
          <p>
            This is reported presence, not an independent runtime hash check or
            model-readiness test. No upload, model creation or generation was
            performed.
          </p>
          {result.state === "present-reported" && (
            <RuntimeModelCreate
              key={record.runId + record.receiptSha256 + receipt.runId}
              record={record}
              stage={receipt}
              onBusyChange={setCreating}
              disabled={disabled || busy}
            />
          )}
        </section>
      )}
    </section>
  );
}
