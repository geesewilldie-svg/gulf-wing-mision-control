"use client";
import { useEffect, useRef, useState } from "react";
import VaultNoteReview from "./vault-note-review";
import type { Scope } from "@/lib/foundation/contracts";
type Inspection = {
  workspace: Scope;
  total: number;
  offset: number;
  nextOffset: number | null;
  checkedAt: string;
  notice: string;
  rows: {
    id: string;
    noteId: string;
    name: string | null;
    kind: string;
    producer: string;
    savedAt: string;
    fileState: string;
    sourceState: string;
    superseded: boolean;
    reviewTarget?: {
      kind: "owner-memory" | "work-note";
      taskId?: string;
    } | null;
  }[];
};
const fileLabels: Record<string, string> = {
  unchanged: "Unchanged since save",
  "externally-changed": "External edit detected",
  missing: "Saved file missing",
  unavailable: "Source unavailable",
};
const sourceLabels: Record<string, string> = {
  "matches-current-record": "Matches the current source record",
  "historical-version": "Historical source version",
  "source-missing": "Original task record is no longer available",
};
export default function SavedNoteVersions({ workspace }: { workspace: Scope }) {
  const [data, setData] = useState<Inspection | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const generation = useRef(0),
    request = useRef<AbortController | null>(null);
  useEffect(() => {
    generation.current++;
    request.current?.abort();
    setData(null);
    setError("");
    setBusy(false);
    return () => {
      generation.current++;
      request.current?.abort();
    };
  }, [workspace]);
  async function inspect(offset = 0) {
    const current = ++generation.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    setData(null);
    try {
      const response = await fetch("/api/sync/foundation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          op: "memory.notes.inspect",
          scope: workspace,
          offset,
        }),
      });
      const result = await response.json();
      if (current !== generation.current || controller.signal.aborted) return;
      if (!response.ok)
        throw Error(result.error || "Saved-note inspection unavailable.");
      if (result.workspace !== workspace || !Array.isArray(result.rows))
        throw Error("Unexpected saved-note response.");
      setData(result);
    } catch (failure) {
      if (current === generation.current && !controller.signal.aborted)
        setError((failure as Error).message);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  return (
    <details className="nexus-card saved-note-versions">
      <summary>Saved note versions</summary>
      <p>
        Track new reviewed snapshots and journal notes saved after this update.
        Earlier exports are not automatically adopted. Inspect reads up to ten
        tracked files to check their hashes; it does not modify or import them.
      </p>
      <button disabled={busy} onClick={() => void inspect()}>
        Inspect {workspace} saved notes
      </button>
      {busy && <p role="status">Checking saved-note versions…</p>}
      {error && <p role="status">{error}</p>}
      {data && (
        <section aria-label="Saved-note inspection results">
          <p>
            {data.total} tracked snapshots in {workspace} · Checked{" "}
            {data.checkedAt}
          </p>
          <p>{data.notice}</p>
          {!data.rows.length && (
            <p>
              No tracked snapshots in this workspace yet. New vault saves and
              automatic completed-task notes register here.
            </p>
          )}
          <ul>
            {data.rows.map((row) => (
              <li key={row.id}>
                <strong>{row.name || "Selected source unavailable"}</strong>
                <p>
                  {fileLabels[row.fileState] || "Inspection state unavailable"}{" "}
                  ·{" "}
                  {sourceLabels[row.sourceState] || "Source state unavailable"}
                </p>
                <small>
                  {row.kind === "owner-memory"
                    ? "Owner-memory snapshot"
                    : "Unverified work note"}{" "}
                  ·{" "}
                  {row.producer === "automatic"
                    ? "Automatic journal"
                    : "Reviewed save"}{" "}
                  · Saved {row.savedAt}
                </small>
                <p>
                  Stable note identity: <code>{row.noteId}</code>
                </p>
                {row.reviewTarget && (
                  <details>
                    <summary>Review a separate current copy</summary>
                    <p>
                      The existing note is retained. This previews the current
                      Nexus source record, excluding external edits to the saved
                      file. Confirm only if you want an additional snapshot.
                      Inspect again after saving to update this list.
                    </p>
                    <VaultNoteReview
                      workspace={workspace}
                      taskId={row.reviewTarget.taskId}
                    />
                  </details>
                )}
                {row.superseded && (
                  <p>
                    A separate saved copy matches the current source version.
                    This historical copy is retained.
                  </p>
                )}
              </li>
            ))}
          </ul>
          <div className="foundation-actions">
            {data.offset > 0 && (
              <button
                disabled={busy}
                onClick={() => void inspect(Math.max(0, data.offset - 10))}
              >
                Previous saved-note page
              </button>
            )}
            {data.nextOffset !== null && (
              <button
                disabled={busy}
                onClick={() => void inspect(data.nextOffset!)}
              >
                Next saved-note page
              </button>
            )}
          </div>
        </section>
      )}
    </details>
  );
}
