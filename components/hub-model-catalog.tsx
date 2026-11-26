"use client";
import { useEffect, useRef, useState } from "react";
import type { HubModelMetadata } from "@/lib/hub-model";
function size(bytes: number | null) {
  return bytes === null ? "Unknown" : `${bytes.toLocaleString()} bytes`;
}
export default function HubModelCatalog({ disabled }: { disabled: boolean }) {
  const [repository, setRepository] = useState(""),
    [revision, setRevision] = useState("");
  const [data, setData] = useState<HubModelMetadata | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (disabled) {
      pending.current?.abort();
      setData(null);
      setBusy(false);
      setError("");
    }
  }, [disabled]);
  async function lookup(event: React.FormEvent) {
    event.preventDefault();
    if (disabled) return;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setData(null);
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/sync/models/hub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repository: repository.trim(),
          revision: revision.trim(),
        }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok)
        throw Error(result.error || "Model metadata unavailable.");
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
    a.download = "nexus-hub-model-metadata.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <details className="nexus-card">
      <summary>Hugging Face model metadata</summary>
      <p>
        Look up a public model by its exact repository ID. Only that ID and
        revision go to huggingface.co; your question, memories, files and
        conversation are not included.
      </p>
      <p>
        This reads catalog metadata only. Downloads, model installation, hosted
        inference and hardware compatibility are not connected.
      </p>
      <form onSubmit={lookup}>
        <label>
          Public model repository
          <input
            required
            maxLength={193}
            placeholder="owner/model"
            value={repository}
            disabled={disabled || busy}
            onChange={(e) => setRepository(e.target.value)}
          />
        </label>
        <label>
          Commit revision (optional)
          <input
            maxLength={40}
            placeholder="Full 40-character commit, or leave blank for main"
            value={revision}
            disabled={disabled || busy}
            onChange={(e) => setRevision(e.target.value)}
          />
        </label>
        <div className="nexus-actions">
          <button disabled={disabled || busy} type="submit">
            Look up public model metadata
          </button>
          {busy && (
            <button
              type="button"
              onClick={() => {
                pending.current?.abort();
                setBusy(false);
                setError("Model metadata lookup cancelled.");
              }}
            >
              Cancel metadata lookup
            </button>
          )}
        </div>
      </form>
      {disabled && (
        <p>Pair this browser as a Controller to inspect model metadata.</p>
      )}
      {busy && <p role="status">Reading public model metadata…</p>}
      {error && <p role="status">{error}</p>}
      {data && (
        <section
          className="nexus-hub-result"
          aria-label="Hub model metadata result"
        >
          <h3>{data.repository}</h3>
          <p>{data.notice}</p>
          <dl>
            <div>
              <dt>Commit revision</dt>
              <dd>{data.revision}</dd>
            </div>
            <div>
              <dt>License reported by Hub</dt>
              <dd>
                {data.license || "Unknown — review the repository license"}
              </dd>
            </div>
            <div>
              <dt>Access reported by Hub</dt>
              <dd>{data.access}</dd>
            </div>
            <div>
              <dt>Total artifact bytes</dt>
              <dd>
                {size(data.totalBytes)} · known-size subtotal:{" "}
                {size(data.knownBytes)}
              </dd>
            </div>
          </dl>
          <p>
            {data.artifacts.length} shown of {data.validArtifacts} valid
            artifacts · {data.omittedArtifacts} omitted from this view ·{" "}
            {data.withheldArtifacts} invalid entries withheld ·{" "}
            {data.unknownSizeArtifacts} sizes unknown.
          </p>
          <p>
            {data.sha256ReportedArtifacts} artifacts have a reported SHA-256.
            These digests have not been verified against downloaded bytes. Model
            files are not downloaded; inference readiness is not established.
          </p>
          <div className="nexus-actions">
            <a href={data.sourceUrl} target="_blank" rel="noopener noreferrer">
              Review this commit on Hugging Face ↗
            </a>
            <button onClick={download}>Download visible metadata</button>
          </div>
          <details>
            <summary>Artifact metadata</summary>
            <ul className="nexus-hub-artifacts">
              {data.artifacts.map((file) => (
                <li key={file.filename}>
                  <strong>{file.filename}</strong>
                  <span>{size(file.bytes)}</span>
                  <span>Reported SHA-256: {file.sha256 || "Not supplied"}</span>
                  <span>
                    Git blob ID: {file.gitBlobId || "Not supplied"} (not a
                    verified file SHA-256)
                  </span>
                </li>
              ))}
            </ul>
          </details>
          <p>
            Checked at {data.checkedAt}. Missing license, hashes, size or
            runtime support must be resolved before any future acquisition.
          </p>
        </section>
      )}
    </details>
  );
}
