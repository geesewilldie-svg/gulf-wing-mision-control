"use client";
import type { JournalReceiptView } from "@/lib/work-journal";
export default function JournalReceipt({
  entry,
  detail = false,
  busy,
  view,
  open,
}: {
  entry: JournalReceiptView;
  detail?: boolean;
  busy: boolean;
  view: () => void;
  open: () => void;
}) {
  return (
    <article
      className="nexus-card"
      style={{ marginBlock: "1rem" }}
      aria-label="Work journal entry"
    >
      <h4>{entry.currentTaskLabel || "Task " + entry.taskId.slice(0, 8)}</h4>
      <p>
        <strong>
          {entry.state === "saved"
            ? "Saved — recorded read-back"
            : entry.state === "skipped"
              ? "Skipped before writing"
              : "Save unconfirmed"}
        </strong>
        {entry.at
          ? " · " + new Date(entry.at).toLocaleString()
          : " · Time not recorded"}
      </p>
      {entry.workspace && <p>Recorded workspace: {entry.workspace}</p>}
      {entry.state === "saved" && (
        <p>
          {entry.indexing === "indexed"
            ? "Indexing was recorded as complete."
            : entry.indexing === "pending"
              ? "Note saved; automatic indexing pending."
              : "Indexing status not recorded."}{" "}
          Current file availability is checked only when opening it.
        </p>
      )}
      {detail ? (
        <>
          {entry.filename && (
            <p style={{ overflowWrap: "anywhere" }}>{entry.filename}</p>
          )}
          <details>
            <summary>Receipt reference</summary>
            <p style={{ overflowWrap: "anywhere" }}>{entry.reference}</p>
            {entry.sha256 && (
              <p style={{ overflowWrap: "anywhere" }}>
                Recorded SHA-256: {entry.sha256}
              </p>
            )}
          </details>
          {entry.indexedFile && (
            <button disabled={busy} onClick={open}>
              Open indexed journal note
            </button>
          )}
        </>
      ) : (
        <button disabled={busy} onClick={view}>
          View journal entry
        </button>
      )}
    </article>
  );
}
