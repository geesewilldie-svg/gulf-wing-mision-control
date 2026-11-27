"use client";
import { useEffect, useRef, useState } from "react";
import type { HubArchiveRecord } from "@/lib/hub-archive";
import type { RuntimeBlobReceipt } from "@/lib/runtime-blob";
import type { RuntimeModelReceipt } from "@/lib/runtime-model";
export default function RuntimeModelCreate({
  record,
  stage,
  disabled,
  onBusyChange,
}: {
  record: HubArchiveRecord;
  stage: RuntimeBlobReceipt;
  disabled: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [reviewed, setReviewed] = useState(false),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<RuntimeModelReceipt | null>(null),
    [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      pending.current?.abort();
      onBusyChange?.(false);
    },
    [onBusyChange],
  );
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  useEffect(() => {
    if (disabled) {
      pending.current?.abort();
      setResult(null);
      setError("");
      setBusy(false);
      setReviewed(false);
    }
  }, [disabled]);
  const retained =
    record.runtimeModel && record.runtimeModel.state !== "not-recorded";
  async function create() {
    if (disabled || busy || !reviewed || result || retained) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/sync/models/hub/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-runtime-model",
          slot: record.slot,
          receiptSha256: record.receiptSha256,
          stageRunId: stage.runId,
          expectedLicense: record.reportedLicense,
          licenseReviewed: true,
          createOnly: true,
        }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok)
        throw Error(data.error || "Model creation could not be confirmed.");
      if (
        data.alias !== `nexus-archive-${data.runId}:latest` ||
        typeof data.manifestDigest !== "string" ||
        !/^[a-f0-9]{64}$/.test(data.manifestDigest) ||
        data.state !== "created" ||
        data.slot !== record.slot ||
        data.receiptSha256 !== record.receiptSha256 ||
        data.stageRunId !== stage.runId ||
        data.sha256 !== record.recordedSha256 ||
        data.bytes !== record.recordedBytes ||
        data.runtimeImported !== true ||
        data.inferenceReady !== false
      )
        throw Error(
          "The creation identity changed. Inspect the retained outcome before another action.",
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
      aria-label={`Runtime model creation ${record.slot}`}
    >
      <h4>Create a separate local model</h4>
      <p>
        Create from this blob under a new Nexus-generated name. Source, license,
        blob presence, storage and RAM are checked again. This can take several
        minutes and use system resources.
      </p>
      <p>
        Your current model selection stays unchanged. Cancellation can leave a
        model or uncertain receipt; no automatic retry or deletion.
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
          A creation receipt is already retained for this archive. Inspect its
          recorded name and outcome; this action will not replay it.
        </p>
      ) : (
        <>
          <label className="business-check">
            <input
              type="checkbox"
              checked={reviewed}
              disabled={disabled || busy || !!result}
              onChange={(event) => setReviewed(event.target.checked)}
            />
            I reviewed the source/license and want a new local model, without
            selecting or running it.
          </label>
          <div className="nexus-actions">
            <button
              disabled={disabled || busy || !reviewed || !!result}
              onClick={() => void create()}
            >
              Create new local model · {record.slot}
            </button>
            {busy && (
              <button
                onClick={() => {
                  pending.current?.abort();
                  setBusy(false);
                  setError(
                    "Request cancelled. The generated model or receipt may remain. Inspect the archive before further action; no automatic retry.",
                  );
                }}
              >
                Cancel local model creation
              </button>
            )}
          </div>
        </>
      )}
      {busy && (
        <p role="status">
          Checking prerequisites and creating a new runtime model… Keep this
          page open.
        </p>
      )}
      {error && <p role="status">{error}</p>}
      {result && (
        <section
          className="nexus-hub-result"
          aria-label={`Runtime model creation result ${record.slot}`}
        >
          <h4>Runtime reports a new local model</h4>
          <p>Model: {result.alias}</p>
          <p>Reported manifest digest: {result.manifestDigest}</p>
          <p>
            Creation and metadata were acknowledged; inference has not been
            tested. Refresh Installed local models to inspect it and choose an
            explicit local diagnostic. Your default selection was not changed.
          </p>
        </section>
      )}
    </section>
  );
}
