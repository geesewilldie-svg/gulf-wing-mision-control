"use client";
import { useEffect, useRef, useState } from "react";
import type { HubImportReview as Review } from "@/lib/hub-import-review";
import type { HubArchiveRecord } from "@/lib/hub-archive";
export default function HubImportReview({
  record,
  disabled,
}: {
  record: HubArchiveRecord;
  disabled: boolean;
}) {
  const [data, setData] = useState<Review | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (disabled) {
      pending.current?.abort();
      setData(null);
      setError("");
      setBusy(false);
    }
  }, [disabled]);
  async function review() {
    if (disabled || busy) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setData(null);
    setError("");
    try {
      const response = await fetch("/api/sync/models/hub/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "import-review",
          slot: record.slot,
          receiptSha256: record.receiptSha256,
        }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok)
        throw Error(result.error || "Import review unavailable.");
      if (
        result.slot !== record.slot ||
        result.runId !== record.runId ||
        result.receiptSha256 !== record.receiptSha256 ||
        result.bytes !== record.recordedBytes ||
        result.sha256 !== record.recordedSha256
      )
        throw Error("The archive identity changed. Inspect the archive again.");
      setData(result);
    } catch (error) {
      if (!controller.signal.aborted) setError((error as Error).message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  function download() {
    if (!data) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `nexus-import-review-${record.slot}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const bytes = (n: number | null) =>
    n === null
      ? "Unknown"
      : n >= 1073741824
        ? `${(n / 1073741824).toFixed(1)} GiB`
        : n >= 1048576
          ? `${(n / 1048576).toFixed(1)} MiB`
          : `${n.toLocaleString()} bytes`;
  return (
    <section className="nexus-card" aria-label={`Import review ${record.slot}`}>
      <h4>Review this archive for runtime import</h4>
      <p>
        Check file integrity, declared model details, Ollama version and host
        RAM. Read-only; large files may take several minutes. No model is
        imported or run.
      </p>
      <div className="nexus-actions">
        <button
          disabled={disabled || busy || !record.receiptSha256}
          onClick={() => void review()}
        >
          Review runtime import · {record.slot}
        </button>
        {busy && (
          <button
            onClick={() => {
              pending.current?.abort();
              setBusy(false);
              setError(
                "Import review cancelled. No runtime import was attempted.",
              );
            }}
          >
            Cancel import review
          </button>
        )}
        {data && (
          <button disabled={disabled || busy} onClick={download}>
            Download import review · {record.slot}
          </button>
        )}
      </div>
      {busy && (
        <p role="status">
          Checking the archived file and import prerequisites…
        </p>
      )}
      {error && <p role="status">{error}</p>}
      {data && (
        <section
          className="nexus-hub-result"
          aria-label={`Import review result ${record.slot}`}
        >
          <h4>Archive checked; import remains unavailable</h4>
          <p>
            The file matches the inspected receipt. Storage, runtime support and
            hardware fit still need checking.
          </p>
          <dl className="nexus-source-metadata">
            {[
              ["Local file integrity", "Full size and SHA-256 match"],
              ["Archive size", bytes(data.bytes)],
              [
                "Declared architecture",
                data.metadata.architecture ?? "Unknown",
              ],
              [
                "Declared context length",
                data.metadata.contextLength ?? "Unknown",
              ],
              [
                "Local runtime version (reported)",
                data.runtime.version ?? "Unavailable",
              ],
              ["Host total RAM", bytes(data.hostMemory.totalBytes)],
              ["Host free RAM snapshot", bytes(data.hostMemory.freeBytes)],
              ["Recorded license", data.recordedLicense],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <h4>Remaining prerequisites</h4>
          <ul className="nexus-hub-artifacts">
            {data.blockers.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>
            Hash checked {data.hashCheckedAt}. This is a snapshot; the download
            includes exact values and verification limits.
          </p>
        </section>
      )}
    </section>
  );
}
