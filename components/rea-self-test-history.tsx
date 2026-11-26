"use client";
import { useEffect, useRef, useState } from "react";
import type { ReaSelfTestHistory as History } from "@/lib/rea-self-test-history";

export default function ReaSelfTestHistory() {
  const [history, setHistory] = useState<History | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function load() {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setHistory(null);
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/sync/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rea-test-history" }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok)
        throw Error(result.error || "Saved test history is unavailable.");
      setHistory(result);
    } catch (error) {
      if (!controller.signal.aborted) setError((error as Error).message);
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
    const link = document.createElement("a");
    link.href = url;
    link.download = "nexus-rea-test-history.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section
      className="nexus-receipt-history nexus-card"
      aria-label="Saved REA test history"
    >
      <h3>Saved browser test history</h3>
      <p>
        Review previous local self-tests without starting REA or opening a
        browser. Saved results describe that run only; they do not establish
        current readiness.
      </p>
      <div className="nexus-actions">
        <button disabled={busy} onClick={() => void load()}>
          View saved REA test history
        </button>
        {history?.state === "available" && history.records.length > 0 && (
          <button onClick={download}>Download visible test history</button>
        )}
        {busy && (
          <button
            onClick={() => {
              pending.current?.abort();
              setBusy(false);
              setError("History read cancelled.");
            }}
          >
            Cancel history read
          </button>
        )}
      </div>
      {busy && <p role="status">Reading saved test metadata…</p>}
      {error && <p role="status">{error}</p>}
      {history && (
        <section aria-label="REA test history results">
          <p>{history.notice}</p>
          {history.state === "not-created" ? (
            <p>
              No saved test history yet. Run the owned browser self-test above
              to create a receipt.
            </p>
          ) : history.state === "unavailable" ? (
            <p>Saved history could not be read safely. No records are shown.</p>
          ) : (
            <>
              <p>
                {history.records.length} shown of {history.validRecords} valid
                receipts · {history.withheldRecords} unreadable, invalid or
                duplicate records withheld · {history.occupiedSlots} /{" "}
                {history.capacity} receipt slots occupied.
              </p>
              <p>
                Read at <time dateTime={history.readAt}>{history.readAt}</time>.
                Newest {history.pageLimit} valid records are shown.
              </p>
              {history.occupiedSlots >= history.capacity && (
                <p role="status">
                  Receipt storage is full. Further tests can report a pending
                  receipt; existing files are retained.
                </p>
              )}
              {history.records.length === 0 && (
                <p>No valid saved test records were found.</p>
              )}
              <div className="nexus-receipt-list">
                {history.records.map((record) => (
                  <article key={record.runId}>
                    <h4>
                      {record.state === "verified"
                        ? "Verified owned-fixture run"
                        : record.state === "cancelled"
                          ? "Cancelled run"
                          : "Failed or unconfirmed run"}
                    </h4>
                    <dl>
                      <div>
                        <dt>Finished</dt>
                        <dd>
                          <time dateTime={record.finishedAt}>
                            {record.finishedAt}
                          </time>
                        </dd>
                      </div>
                      <div>
                        <dt>Run</dt>
                        <dd>{record.runId}</dd>
                      </div>
                      <div>
                        <dt>REA version recorded</dt>
                        <dd>{record.reaVersion}</dd>
                      </div>
                      {record.nodeVersion && (
                        <div>
                          <dt>Node version recorded</dt>
                          <dd>{record.nodeVersion}</dd>
                        </div>
                      )}
                      {record.completeness && (
                        <div>
                          <dt>Capture completeness</dt>
                          <dd>
                            {record.completeness}. Partial capture is not a
                            security audit.
                          </dd>
                        </div>
                      )}
                    </dl>
                    {record.evidenceId && (
                      <details>
                        <summary>Evidence identity for this run</summary>
                        <p>Evidence ID: {record.evidenceId}</p>
                        <p>Evidence SHA-256: {record.evidenceSha256}</p>
                        <p>
                          This is recorded local metadata, not a new hash check
                          of the browser or installed package.
                        </p>
                      </details>
                    )}
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </section>
  );
}
