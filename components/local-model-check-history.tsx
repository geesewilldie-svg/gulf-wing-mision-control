"use client";
import { useEffect, useRef, useState } from "react";
import type { LocalModelCheckHistory as History } from "@/lib/local-model-check-history";
export default function LocalModelCheckHistory({
  initialResult,
}: { initialResult?: History } = {}) {
  const [data, setData] = useState<History | null>(initialResult || null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function inspect() {
    if (busy) return;
    const controller = new AbortController();
    pending.current = controller;
    setData(null);
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/sync/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "local-model-check-history" }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok)
        throw Error(result.error || "Saved diagnostics unavailable.");
      if (
        !["available", "not-created", "unavailable"].includes(result.state) ||
        !Array.isArray(result.records) ||
        result.records.length > 20
      )
        throw Error("Saved diagnostics response is unsupported.");
      setData(result);
    } catch (e) {
      if (!controller.signal.aborted) setError((e as Error).message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  function download() {
    if (!data) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "nexus-local-model-check-history.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <details
      className="nexus-local-model-check-history"
      open={initialResult ? true : undefined}
    >
      <summary>Saved local model diagnostics</summary>
      <p>
        Review completed fixed tests after a refresh. These are historical
        results; they do not check the current model or run it again. Cancelled,
        failed and uncertain requests are not included.
      </p>
      <div className="nexus-actions">
        <button disabled={busy} onClick={() => void inspect()}>
          Read saved model diagnostics
        </button>
        <button disabled={busy || !data} onClick={download}>
          Download saved model diagnostics
        </button>
        {busy && (
          <button
            onClick={() => {
              pending.current?.abort();
              setBusy(false);
              setError("History read cancelled.");
            }}
          >
            Cancel diagnostic history read
          </button>
        )}
      </div>
      {busy && <p role="status">Reading saved diagnostics…</p>}
      {error && <p role="status">{error}</p>}
      {data && (
        <section aria-label="Saved model diagnostic results">
          <p>{data.notice}</p>
          <p>
            {data.state === "available"
              ? "History available"
              : data.state === "not-created"
                ? "No history store yet"
                : "History unavailable"}{" "}
            · Read {data.readAt}
          </p>
          <p>
            {data.records.length} shown · {data.validRecords} valid completed
            results · {data.withheldRecords} withheld · {data.occupiedSlots} /{" "}
            {data.capacity} slots occupied
          </p>
          {data.state === "available" && !data.records.length && (
            <p>No readable completed diagnostics.</p>
          )}
          {data.records.map((record) => (
            <article
              className="nexus-card"
              key={record.runId}
              aria-label={`Saved diagnostic ${record.runId}`}
            >
              <h4>
                {record.state === "passed"
                  ? "Historical fixed test passed"
                  : "Historical test completed; unexpected response"}
              </h4>
              <p>
                Requested: {record.model} · Reported: {record.reportedModel}
              </p>
              <p>
                Checked {record.checkedAt} · Elapsed {record.elapsedMs} ms ·
                Reported output tokens:{" "}
                {record.reportedOutputTokens ?? "Unknown"}
              </p>
              <p style={{ overflowWrap: "anywhere" }}>
                Recorded manifest digest: {record.digest}
              </p>
              <p>
                This records one completed diagnostic. It does not establish
                current identity, loaded state or future readiness.
              </p>
            </article>
          ))}
        </section>
      )}
    </details>
  );
}
