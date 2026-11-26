"use client";
import { useEffect, useRef, useState } from "react";
import type { HubAcquisitionPreview } from "@/lib/hub-acquisition";
import type { HubArchiveReceipt } from "@/lib/hub-archive";
export default function HubArchiveTransfer({
  preview,
}: {
  preview: HubAcquisitionPreview;
}) {
  const [reviewed, setReviewed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<HubArchiveReceipt | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function acquire(event: React.FormEvent) {
    event.preventDefault();
    if (!reviewed || !preview.metadataAndCapacityReady || busy || result)
      return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/sync/models/hub/acquire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repository: preview.repository,
          revision: preview.revision,
          filename: preview.artifact.filename,
          expectedBytes: preview.artifact.bytes,
          expectedSha256: preview.artifact.sha256,
          expectedLicense: preview.license,
          licenseReviewed: true,
          archiveOnly: true,
        }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok)
        throw Error(data.error || "Archive transfer could not be confirmed.");
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
      aria-label="Archive reviewed model artifact"
    >
      <h4>Archive this model file</h4>
      <p>
        This downloads the selected file to the laptop's private model archive.
        It rechecks the source, license identifier and free space first, then
        verifies the full size and SHA-256, including local readback. It does
        not import, execute or activate the model.
      </p>
      <p>
        One transfer at a time, up to 4 GiB and 10 minutes. Unsupported
        redirects stop the transfer. Interrupted transfers do not resume
        automatically; incomplete or uncertain receipts are retained.
      </p>
      {!preview.metadataAndCapacityReady ? (
        <p>
          Resolve the blocked acquisition checks before requesting a transfer.
        </p>
      ) : (
        <form onSubmit={acquire}>
          <label className="business-check">
            <input
              type="checkbox"
              checked={reviewed}
              disabled={busy || !!result}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            I reviewed the license terms for this commit and want to archive
            this file only.
          </label>
          <div className="nexus-actions">
            <button type="submit" disabled={!reviewed || busy || !!result}>
              Download reviewed file to laptop archive
            </button>
            {busy && (
              <button
                type="button"
                onClick={() => {
                  pending.current?.abort();
                  setBusy(false);
                  setError(
                    "Transfer request cancelled. Cleanup may still be finishing; a file or receipt can remain if publication already occurred. Check the private archive before retrying.",
                  );
                }}
              >
                Cancel archive transfer
              </button>
            )}
          </div>
        </form>
      )}
      {busy && (
        <p role="status">
          Downloading and verifying the model file… Keep this page open. Closing
          or changing the preview cancels this request; completed publication
          may still have a saved receipt.
        </p>
      )}
      {error && <p role="status">{error}</p>}
      {result && (
        <section
          className="nexus-hub-result"
          aria-label="Model archive transfer result"
        >
          <h4>Archived and verified</h4>
          <p>{result.notice}</p>
          <dl>
            <div>
              <dt>Run</dt>
              <dd>{result.runId}</dd>
            </div>
            <div>
              <dt>Archive file</dt>
              <dd>{result.archiveFile}</dd>
            </div>
            <div>
              <dt>Verified bytes</dt>
              <dd>{result.bytes.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Verified SHA-256</dt>
              <dd>{result.sha256}</dd>
            </div>
            <div>
              <dt>Verified at</dt>
              <dd>{result.verifiedAt}</dd>
            </div>
          </dl>
          <p>
            Receipt: {result.receiptState}. Runtime imported: no. Inference
            ready: not established.
          </p>
        </section>
      )}
    </section>
  );
}
