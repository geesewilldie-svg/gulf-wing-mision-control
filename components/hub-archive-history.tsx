"use client";
import { useEffect, useRef, useState } from "react";
import RuntimeBlobCheck from "./runtime-blob-check";
import HubImportReview from "./hub-import-review";
import HubArchiveMetadata from "./hub-archive-metadata";
import HubArchiveResume from "./hub-archive-resume";
import type {
  HubArchiveHistory as History,
  HubArchiveVerification,
  HubArchiveRecord,
  HubArchiveReconciliation,
} from "@/lib/hub-archive";
const stateLabel = (state: HubArchiveRecord["state"]) =>
  ({
    started: "Unfinished — active or interrupted",
    verified: "Recorded verified transfer",
    failed: "Failed transfer",
    cancelled: "Cancelled transfer",
    "publication-unconfirmed": "Publication unconfirmed",
  })[state];
const fileLabel = (state: HubArchiveRecord["fileState"]) =>
  ({
    "size-matches-record": "Present; size matches record (hash not checked)",
    "size-mismatch": "Present; size differs from record",
    missing: "Published file missing",
    "unsafe-or-unavailable": "File unavailable or unsafe to inspect",
  })[state];
export default function HubArchiveHistory({ disabled }: { disabled: boolean }) {
  const [history, setHistory] = useState<History | null>(null),
    [verification, setVerification] = useState<HubArchiveVerification | null>(
      null,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [reconciliation, setReconciliation] =
    useState<HubArchiveReconciliation | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (disabled) {
      pending.current?.abort();
      setHistory(null);
      setVerification(null);
      setReconciliation(null);
      setBusy(false);
      setError("");
    }
  }, [disabled]);
  async function request(slot?: string, reconcile = false) {
    if (disabled) return;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setError("");
    setVerification(null);
    setReconciliation(null);
    setBusy(true);
    if (!slot) setHistory(null);
    try {
      const recorded = history?.records.find((record) => record.slot === slot);
      if (reconcile && !recorded?.receiptSha256)
        throw Error(
          "Inspect the current archive receipt before reconciliation.",
        );
      const response = await fetch("/api/sync/models/hub/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          slot
            ? reconcile
              ? {
                  action: "reconcile",
                  slot,
                  receiptSha256: recorded!.receiptSha256,
                }
              : { action: "verify", slot }
            : { action: "list" },
        ),
        signal: controller.signal,
      });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok)
        throw Error(data.error || "Archive inspection unavailable.");
      if (slot) {
        const checked = reconcile ? data.verification : data;
        if (
          !recorded ||
          recorded.runId !== checked.runId ||
          recorded.recordedBytes !== checked.recordedBytes ||
          recorded.recordedSha256 !== checked.recordedSha256 ||
          (recorded.receiptSha256 &&
            recorded.receiptSha256 !== checked.receiptSha256)
        )
          throw Error(
            "The archive record changed. Inspect the archive again before accepting a file check.",
          );
        if (reconcile) {
          setReconciliation(data);
          if (data.recovery)
            setHistory(
              (current) =>
                current && {
                  ...current,
                  records: current.records.map((record) =>
                    record.slot === slot
                      ? {
                          ...record,
                          recovery: {
                            state: "recorded",
                            recordedAt: data.recovery.recordedAt,
                          },
                        }
                      : record,
                  ),
                },
            );
        } else setVerification(data);
      } else setHistory(data);
    } catch (error) {
      if (!controller.signal.aborted) {
        setError((error as Error).message);
        setHistory(null);
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  function download() {
    if (!history) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(history, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "nexus-model-archive-history.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <details className="nexus-card">
      <summary>Local model archive</summary>
      <p>
        Review saved transfers and present file sizes without reading model
        weights or contacting a provider. A recorded verified transfer is
        historical; check a completed file explicitly to compare its current
        bytes with the local receipt.
      </p>
      <div className="nexus-actions">
        <button disabled={disabled || busy} onClick={() => void request()}>
          Inspect local model archive
        </button>
        {history?.records.length ? (
          <button disabled={busy} onClick={download}>
            Download visible archive records
          </button>
        ) : null}
        {busy && (
          <button
            onClick={() => {
              pending.current?.abort();
              setBusy(false);
              setVerification(null);
              setError(
                "Archive inspection cancelled. No model bytes were changed. Any completed recovery metadata is retained.",
              );
            }}
          >
            Cancel archive inspection
          </button>
        )}
      </div>
      {disabled && <p>Pair as a Controller to inspect the private archive.</p>}
      {busy && (
        <p role="status">
          Reading the archive or checking selected file bytes…
        </p>
      )}
      {error && <p role="status">{error}</p>}
      {history && (
        <section aria-label="Local model archive records">
          <p>{history.notice}</p>
          {history.state === "not-created" ? (
            <p>No local model archive has been created.</p>
          ) : history.state === "unavailable" ? (
            <p>
              The archive could not be inspected safely. No records are shown.
            </p>
          ) : (
            <>
              <p>
                {history.records.length} shown of {history.validRecords} valid
                records · {history.withheldRecords} invalid or unreadable
                records withheld · {history.occupiedSlots} / {history.capacity}{" "}
                slots occupied. Newest {history.pageLimit} valid records are
                shown.
              </p>
              {history.occupiedSlots >= history.capacity && (
                <p>
                  Archive record capacity is full. Existing records and files
                  are retained.
                </p>
              )}
              {history.records.length === 0 && (
                <p>No valid archive receipts were found.</p>
              )}
              <div className="nexus-receipt-list">
                {history.records.map((record) => (
                  <article key={record.slot}>
                    <h3>
                      {record.repository} / {record.sourceFilename}
                    </h3>
                    <p>{stateLabel(record.state)}</p>
                    <dl>
                      <div>
                        <dt>Archive slot</dt>
                        <dd>{record.slot}</dd>
                      </div>
                      <div>
                        <dt>Recorded at</dt>
                        <dd>{record.recordedAt}</dd>
                      </div>
                      <div>
                        <dt>File now</dt>
                        <dd>
                          {fileLabel(record.fileState)}
                          {record.fileBytes !== null
                            ? ` · ${record.fileBytes.toLocaleString()} bytes`
                            : ""}
                        </dd>
                      </div>
                      <div>
                        <dt>Partial file metadata</dt>
                        <dd>
                          {record.partialPresent === null
                            ? "Unavailable or unsafe"
                            : record.partialPresent
                              ? "Partial file present; no resume or cleanup was performed"
                              : "No partial file observed"}
                        </dd>
                      </div>
                    </dl>
                    <details>
                      <summary>Recorded source identity</summary>
                      <p>Commit: {record.revision}</p>
                      <p>Run: {record.runId}</p>
                      <p>
                        Recorded bytes: {record.recordedBytes.toLocaleString()}
                      </p>
                      <p>Recorded SHA-256: {record.recordedSha256}</p>
                      <p>
                        License identifier recorded: {record.reportedLicense}.
                        No fresh source or license check was made.
                      </p>
                    </details>
                    {record.fileState === "size-matches-record" && (
                      <HubArchiveMetadata
                        key={record.runId + record.receiptSha256 + "metadata"}
                        record={record}
                        disabled={disabled || busy}
                      />
                    )}
                    {record.state === "verified" &&
                      record.fileState === "size-matches-record" && (
                        <HubImportReview
                          key={record.runId + record.receiptSha256 + "import"}
                          record={record}
                          disabled={disabled || busy}
                        />
                      )}
                    {record.runtimeBlob?.state === "recorded" && (
                      <p>
                        Recorded runtime blob stage:{" "}
                        {record.runtimeBlob.receipt.state} ·{" "}
                        {record.runtimeBlob.receipt.finishedAt ||
                          record.runtimeBlob.receipt.startedAt}
                        . Original archive retained; no model creation or
                        inference is recorded by this staging receipt.
                      </p>
                    )}
                    {record.runtimeBlob?.state === "recorded" && (
                      <RuntimeBlobCheck
                        key={
                          record.runId +
                          record.receiptSha256 +
                          record.runtimeBlob.receipt.runId
                        }
                        record={record}
                        receipt={record.runtimeBlob.receipt}
                        disabled={disabled || busy}
                      />
                    )}
                    {record.runtimeModel?.state === "recorded" && (
                      <p>
                        Recorded model creation:{" "}
                        {record.runtimeModel.receipt.state} ·{" "}
                        {record.runtimeModel.receipt.alias}. This historical
                        receipt is not a current inference-readiness check.
                      </p>
                    )}
                    {record.runtimeModel?.state === "unavailable" && (
                      <p>
                        A model-creation receipt is unsafe, unavailable or
                        belongs to changed source evidence. No replay is
                        available.
                      </p>
                    )}
                    {record.runtimeBlob?.state === "unavailable" && (
                      <p>
                        A runtime staging receipt is unavailable or belongs to
                        changed source evidence. No replay is available.
                      </p>
                    )}
                    {record.resumedFrom && (
                      <p>
                        {record.state === "verified"
                          ? "Resumed from"
                          : "Resume source requested"}
                        : {record.resumedFrom.slot} · retained prefix{" "}
                        {record.resumedFrom.prefixBytes.toLocaleString()} bytes.
                        Original source record is retained.
                      </p>
                    )}
                    {record.state !== "verified" &&
                      record.fileState === "missing" &&
                      record.partialPresent && (
                        <HubArchiveResume
                          key={record.runId + record.receiptSha256}
                          record={record}
                          disabled={disabled || busy}
                        />
                      )}
                    {record.recovery?.state === "recorded" && (
                      <p>
                        Separate recovery receipt recorded at{" "}
                        {record.recovery.recordedAt}. The original transfer
                        outcome is retained; this is not a fresh hash check.
                      </p>
                    )}
                    {record.recovery?.state === "source-changed" && (
                      <p>
                        Existing recovery metadata belongs to a different source
                        record and is not current.
                      </p>
                    )}
                    {record.recovery?.state === "unavailable" && (
                      <p>Recovery metadata could not be inspected safely.</p>
                    )}
                    {["started", "publication-unconfirmed"].includes(
                      record.state,
                    ) && (
                      <>
                        <p>
                          Reconciliation checks an existing published file
                          against this exact local receipt and saves separate
                          recovery metadata if its bytes match. It does not
                          change the original receipt, resume a partial file or
                          establish that an older process has stopped.
                        </p>
                        <div className="nexus-actions">
                          <button
                            disabled={
                              busy ||
                              !record.receiptSha256 ||
                              ![
                                "size-matches-record",
                                "size-mismatch",
                              ].includes(record.fileState)
                            }
                            onClick={() => void request(record.slot, true)}
                          >
                            Reconcile published file · {record.slot}
                          </button>
                        </div>
                      </>
                    )}
                    {reconciliation?.verification.slot === record.slot && (
                      <section
                        className="nexus-hub-result"
                        aria-label={`Archive reconciliation ${record.slot}`}
                      >
                        <h4>
                          {reconciliation.recovery
                            ? reconciliation.recovery.state === "saved"
                              ? "Separate recovery receipt saved"
                              : "Recovery receipt already recorded"
                            : "Published file differs; no recovery receipt saved"}
                        </h4>
                        <p>{reconciliation.verification.notice}</p>
                        <p>
                          File checked at{" "}
                          {reconciliation.verification.checkedAt}. Original
                          transfer outcome: {stateLabel(record.state)}.
                        </p>
                        {reconciliation.recovery && (
                          <p>
                            Recovery {reconciliation.recovery.recoveryId} ·
                            Recorded at {reconciliation.recovery.recordedAt}. No
                            model bytes or original receipt were changed; no
                            runtime import or activation was performed.
                          </p>
                        )}
                      </section>
                    )}
                    {record.state === "verified" && (
                      <div className="nexus-actions">
                        <button
                          disabled={
                            busy ||
                            !["size-matches-record", "size-mismatch"].includes(
                              record.fileState,
                            )
                          }
                          onClick={() => void request(record.slot)}
                        >
                          Check current file · {record.slot}
                        </button>
                      </div>
                    )}
                    {verification?.slot === record.slot && (
                      <section
                        className="nexus-hub-result"
                        aria-label={`Archive file check ${record.slot}`}
                      >
                        <h4>
                          {verification.state === "matches-record"
                            ? "Current file matches recorded size/hash"
                            : "Current file differs from its record"}
                        </h4>
                        <p>{verification.notice}</p>
                        <p>
                          Checked at {verification.checkedAt} ·{" "}
                          {verification.observedBytes.toLocaleString()} observed
                          bytes.
                        </p>
                        <p>
                          Observed SHA-256:{" "}
                          {verification.observedSha256 ||
                            "Not read because size differs"}
                        </p>
                        <p>
                          Runtime imported: no. Inference readiness remains
                          unverified.
                        </p>
                      </section>
                    )}
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </details>
  );
}
