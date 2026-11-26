"use client";
import { useEffect, useRef, useState } from "react";
import type {
  HubArchiveHistory as History,
  HubArchiveVerification,
  HubArchiveRecord,
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
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (disabled) {
      pending.current?.abort();
      setHistory(null);
      setVerification(null);
      setBusy(false);
      setError("");
    }
  }, [disabled]);
  async function request(slot?: string) {
    if (disabled) return;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setError("");
    setVerification(null);
    setBusy(true);
    if (!slot) setHistory(null);
    try {
      const response = await fetch("/api/sync/models/hub/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          slot ? { action: "verify", slot } : { action: "list" },
        ),
        signal: controller.signal,
      });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok)
        throw Error(data.error || "Archive inspection unavailable.");
      if (slot) {
        const recorded = history?.records.find(
          (record) => record.slot === slot,
        );
        if (
          !recorded ||
          recorded.runId !== data.runId ||
          recorded.recordedBytes !== data.recordedBytes ||
          recorded.recordedSha256 !== data.recordedSha256
        )
          throw Error(
            "The archive record changed. Inspect the archive again before accepting a file check.",
          );
        setVerification(data);
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
              setError("Archive inspection cancelled. No model was changed.");
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
