"use client";
import { useEffect, useRef, useState } from "react";
import type { HubArchiveRecord } from "@/lib/hub-archive";
import type { RuntimeBlobReceipt } from "@/lib/runtime-blob";
export default function RuntimeBlobStage({
  record,
}: {
  record: HubArchiveRecord;
}) {
  const [reviewed, setReviewed] = useState(false),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<RuntimeBlobReceipt | null>(null),
    [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const retained =
    record.runtimeBlob && record.runtimeBlob.state !== "not-recorded";
  async function stage() {
    if (busy || !reviewed || result || retained) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/sync/models/hub/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "stage-runtime-blob",
          slot: record.slot,
          receiptSha256: record.receiptSha256,
          expectedLicense: record.reportedLicense,
          licenseReviewed: true,
          stageOnly: true,
        }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok)
        throw Error(data.error || "Staging could not be confirmed.");
      if (
        data.state !== "staged" ||
        data.slot !== record.slot ||
        data.receiptSha256 !== record.receiptSha256 ||
        data.sha256 !== record.recordedSha256 ||
        data.bytes !== record.recordedBytes ||
        data.runtimeImported !== false
      )
        throw Error(
          "The staging identity changed. Inspect the archive before another action.",
        );
      setResult(data);
    } catch (error) {
      if (!controller.signal.aborted) setError((error as Error).message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <section
      className="nexus-card"
      aria-label={`Runtime blob staging ${record.slot}`}
    >
      <h4>Stage weights in local Ollama storage</h4>
      <p>
        This can copy {record.recordedBytes.toLocaleString()} bytes to Ollama.
        It keeps the archive and records a separate outcome. It does not create,
        select or run a model.
      </p>
      <p>
        Storage and source integrity are checked again. Closing or cancelling
        can leave a blob or uncertain receipt; no automatic retry or deletion.
      </p>
      <p>
        Recorded license: {record.reportedLicense}.{" "}
        <a
          href={`https://huggingface.co/${record.repository.split("/").map(encodeURIComponent).join("/")}/tree/${record.revision}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Review source and license
        </a>
      </p>
      {retained ? (
        <p>
          A staging receipt is already retained. Inspect its recorded outcome;
          this action will not overwrite or replay it.
        </p>
      ) : (
        <>
          <label className="business-check">
            <input
              type="checkbox"
              checked={reviewed}
              disabled={busy || !!result}
              onChange={(event) => setReviewed(event.target.checked)}
            />
            I reviewed the source/license and want to stage these weights
            locally, without creating a model.
          </label>
          <div className="nexus-actions">
            <button
              disabled={busy || !reviewed || !!result}
              onClick={() => void stage()}
            >
              Stage weights in Ollama · {record.slot}
            </button>
            {busy && (
              <button
                onClick={() => {
                  pending.current?.abort();
                  setBusy(false);
                  setError(
                    "Request cancelled. A runtime blob or uncertain receipt may remain. Inspect the archive before further action; no automatic retry.",
                  );
                }}
              >
                Cancel runtime blob staging
              </button>
            )}
          </div>
        </>
      )}
      {busy && (
        <p role="status">
          Checking source/storage and staging local weights… Keep this page
          open.
        </p>
      )}
      {error && <p role="status">{error}</p>}
      {result && (
        <section
          className="nexus-hub-result"
          aria-label={`Runtime staging result ${record.slot}`}
        >
          <h4>Runtime acknowledges blob presence</h4>
          <p>
            {result.reusedExisting
              ? "An existing content-addressed blob was reused."
              : "The runtime accepted the upload and reported the blob present."}{" "}
            This is runtime acknowledgment, not an independent hash check of its
            stored copy.
          </p>
          <p>
            A separate staging receipt was saved. No model was created, selected
            or run. Refresh the archive inspection to see the retained outcome.
          </p>
        </section>
      )}
    </section>
  );
}
