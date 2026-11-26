"use client";
import { useEffect, useRef, useState } from "react";
import HubArchiveTransfer from "./hub-archive-transfer";
import type { HubModelMetadata } from "@/lib/hub-model";
import type { HubAcquisitionPreview as Preview } from "@/lib/hub-acquisition";
const bytes = (value: number | null) =>
  value === null ? "Unknown" : `${value.toLocaleString()} bytes`;
export default function HubAcquisitionPreview({
  metadata,
}: {
  metadata: HubModelMetadata;
}) {
  const [filename, setFilename] = useState(
    metadata.artifacts[0]?.filename || "",
  );
  const [result, setResult] = useState<Preview | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function review(event: React.FormEvent) {
    event.preventDefault();
    const artifact = metadata.artifacts.find((a) => a.filename === filename);
    if (!artifact) return;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setResult(null);
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/sync/models/hub/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repository: metadata.repository,
          revision: metadata.revision,
          filename: artifact.filename,
          expectedBytes: artifact.bytes,
          expectedSha256: artifact.sha256,
        }),
        signal: controller.signal,
      });
      const body = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok)
        throw Error(body.error || "Artifact preview unavailable.");
      setResult(body);
    } catch (error) {
      if (!controller.signal.aborted) setError((error as Error).message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  function download() {
    if (!result) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "nexus-model-acquisition-preview.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="nexus-card" aria-label="Model acquisition preview">
      <h3>Review one artifact</h3>
      <p>
        Select from the displayed metadata. Review re-reads this exact commit
        from Hugging Face and checks free space on the laptop's future private
        archive volume. It does not start a transfer.
      </p>
      <form onSubmit={review}>
        <label>
          Artifact to review
          <select
            value={filename}
            disabled={busy}
            onChange={(e) => {
              setFilename(e.target.value);
              setResult(null);
              setError("");
            }}
          >
            {metadata.artifacts.map((a) => (
              <option key={a.filename} value={a.filename}>
                {a.filename}
              </option>
            ))}
          </select>
        </label>
        <div className="nexus-actions">
          <button type="submit" disabled={busy || !filename}>
            Review artifact acquisition
          </button>
          {busy && (
            <button
              type="button"
              onClick={() => {
                pending.current?.abort();
                setBusy(false);
                setError("Acquisition preview cancelled.");
              }}
            >
              Cancel acquisition preview
            </button>
          )}
        </div>
      </form>
      {busy && (
        <p role="status">Checking source metadata and archive capacity…</p>
      )}
      {error && <p role="status">{error}</p>}
      {result && (
        <section
          className="nexus-hub-result"
          aria-label="Artifact acquisition checks"
        >
          <h4>{result.artifact.filename}</h4>
          <p>{result.notice}</p>
          <p>
            {result.metadataAndCapacityReady
              ? "Metadata and capacity checks passed; license and runtime review remain."
              : "Some acquisition prerequisites are blocked or unknown."}{" "}
            Review alone does not download this file.
          </p>
          <dl>
            <div>
              <dt>Commit revision</dt>
              <dd>{result.revision}</dd>
            </div>
            <div>
              <dt>Reported artifact bytes</dt>
              <dd>{bytes(result.artifact.bytes)}</dd>
            </div>
            <div>
              <dt>Reported SHA-256</dt>
              <dd>{result.artifact.sha256 || "Unknown"}</dd>
            </div>
            <div>
              <dt>Planned destination</dt>
              <dd>{result.destination}</dd>
            </div>
            <div>
              <dt>Volume space available at check time</dt>
              <dd>{bytes(result.availableBytes)}</dd>
            </div>
            <div>
              <dt>Required space including reserve</dt>
              <dd>{bytes(result.requiredBytes)}</dd>
            </div>
          </dl>
          <ul className="nexus-hub-artifacts">
            {result.checks.map((check) => (
              <li key={check.id}>
                <strong>
                  {check.label} ·{" "}
                  {check.state === "passed"
                    ? "Passed"
                    : check.state === "blocked"
                      ? "Blocked"
                      : "Review needed"}
                </strong>
                <span>{check.detail}</span>
              </li>
            ))}
          </ul>
          <div className="nexus-actions">
            <button onClick={download}>Download acquisition preview</button>
          </div>
          <HubArchiveTransfer key={result.previewId} preview={result} />
          <p>
            Checked at {result.checkedAt}. This preview is not a reservation,
            transfer authorization or proof of inference readiness.
          </p>
        </section>
      )}
    </section>
  );
}
