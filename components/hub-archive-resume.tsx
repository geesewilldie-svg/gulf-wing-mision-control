"use client";
import { useEffect, useRef, useState } from "react";
import type { HubArchiveRecord, HubArchiveReceipt } from "@/lib/hub-archive";
export default function HubArchiveResume({
  record,
  disabled,
}: {
  record: HubArchiveRecord;
  disabled: boolean;
}) {
  const [reviewed, setReviewed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<HubArchiveReceipt | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (disabled) {
      pending.current?.abort();
      setBusy(false);
      setError("");
      setResult(null);
      setReviewed(false);
    }
  }, [disabled]);
  async function resume(event: React.FormEvent) {
    event.preventDefault();
    if (disabled || busy || !reviewed || result) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/sync/models/hub/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resume",
          slot: record.slot,
          receiptSha256: record.receiptSha256,
          expectedLicense: record.reportedLicense,
          licenseReviewed: true,
          archiveOnly: true,
        }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok)
        throw Error(data.error || "Resume could not be confirmed.");
      setResult(data);
    } catch (error) {
      if (!controller.signal.aborted) setError((error as Error).message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  const eligible =
    !!record.receiptSha256 &&
    record.fileState === "missing" &&
    record.state !== "verified" &&
    record.partialPresent &&
    (record.partialBytes ?? 0) > 0 &&
    record.partialBytes! <= record.recordedBytes;
  return (
    <section
      className="nexus-card"
      aria-label={`Retained partial resume ${record.slot}`}
    >
      <h4>Resume into a new archive slot</h4>
      <p>
        This rechecks the source, license and disk space, then copies the
        retained partial and requests only the remaining bytes. Full-file
        verification still applies. The original partial and receipt stay
        unchanged; an older process is not stopped or assumed inactive.
      </p>
      <p>
        Retained prefix: {record.partialBytes?.toLocaleString() ?? "Unknown"}{" "}
        bytes of {record.recordedBytes.toLocaleString()}. A complete retained
        file can be copied and verified without a model-body request; source
        metadata is still checked.
      </p>
      <p>
        License recorded: {record.reportedLicense}.{" "}
        <a
          href={`https://huggingface.co/${record.repository.split("/").map(encodeURIComponent).join("/")}/tree/${record.revision}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Review source commit
        </a>
      </p>
      <form onSubmit={resume}>
        <label className="business-check">
          <input
            type="checkbox"
            checked={reviewed}
            disabled={disabled || busy || !!result || !eligible}
            onChange={(e) => setReviewed(e.target.checked)}
          />
          I reviewed this commit's license and want to resume an archive-only
          copy into a new slot.
        </label>
        <div className="nexus-actions">
          <button
            type="submit"
            disabled={disabled || busy || !eligible || !reviewed || !!result}
          >
            Resume retained partial · {record.slot}
          </button>
          {busy && (
            <button
              type="button"
              onClick={() => {
                pending.current?.abort();
                setBusy(false);
                setError(
                  "Resume request cancelled. The original partial is retained; a new file or receipt can remain if publication already occurred. Inspect the archive before retrying.",
                );
              }}
            >
              Cancel retained partial resume
            </button>
          )}
        </div>
      </form>
      {busy && (
        <p role="status">
          Copying retained bytes, downloading the remainder and verifying the
          new file… Keep this page open.
        </p>
      )}
      {error && <p role="status">{error}</p>}
      {result && (
        <section
          className="nexus-hub-result"
          aria-label={`Archive resume result ${record.slot}`}
        >
          <h4>New archive copy verified</h4>
          <p>{result.notice}</p>
          <p>
            New file: {result.archiveFile}. Original source:{" "}
            {result.resumedFrom?.slot},{" "}
            {result.resumedFrom?.prefixBytes.toLocaleString()} retained bytes.
          </p>
          <p>Verified SHA-256: {result.sha256}</p>
          <p>
            The original run outcome is unchanged. No runtime import or model
            activation was performed. Inspect the archive again to see the new
            record.
          </p>
        </section>
      )}
    </section>
  );
}
