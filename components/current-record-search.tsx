"use client";
import { useEffect, useRef, useState } from "react";
import { scopes } from "@/lib/foundation/contracts";
import type {
  CurrentRecord,
  CurrentRecordSearch as Results,
  CurrentRecordInspection,
  RecordWorkspace,
} from "@/lib/current-record-search";
export default function CurrentRecordSearch({
  enabled,
  onFoundation,
  initialResult,
  initialInspection,
}: {
  enabled: boolean;
  onFoundation?: () => void;
  initialResult?: Results;
  initialInspection?: CurrentRecordInspection;
}) {
  const [query, setQuery] = useState(initialResult?.query || ""),
    [workspace, setWorkspace] = useState<RecordWorkspace>(
      initialResult?.workspace || "Personal",
    );
  const [data, setData] = useState<Results | null>(initialResult || null),
    [inspection, setInspection] = useState<CurrentRecordInspection | null>(
      initialInspection || null,
    );
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const pending = useRef<AbortController | null>(null);
  const notifyChange = () =>
    window.dispatchEvent(new Event("nexus:record-search-changed"));
  function clear() {
    notifyChange();
    pending.current?.abort();
    setData(null);
    setInspection(null);
    setMessage("");
    setBusy(false);
  }
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (!enabled) clear();
  }, [enabled]);
  async function search(page = 0, paging = false) {
    if (!enabled || busy) return;
    notifyChange();
    const stamp = paging ? data?.stamp : undefined;
    const controller = new AbortController();
    pending.current = controller;
    setData(null);
    setInspection(null);
    setMessage("");
    setBusy(true);
    try {
      const response = await fetch("/api/sync/memory/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          action: "search-current-records",
          workspace,
          query,
          page,
          ...(stamp ? { stamp } : {}),
        }),
      });
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok)
        throw Error(result.error || "Current-record search unavailable.");
      if (
        result.workspace !== workspace ||
        result.query !== query.trim() ||
        result.page !== page ||
        !Array.isArray(result.records) ||
        result.records.length > 20
      )
        throw Error("Search identity changed. Run a fresh search.");
      setData(result);
    } catch (e) {
      if (!controller.signal.aborted) setMessage((e as Error).message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  async function inspect(row: CurrentRecord) {
    if (!enabled || busy || !data) return;
    const controller = new AbortController();
    pending.current = controller;
    setInspection(null);
    setMessage("");
    setBusy(true);
    try {
      const response = await fetch("/api/sync/memory/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          action: "inspect-current-record",
          workspace: data.workspace,
          type: row.type,
          id: row.id,
          revision: row.revision,
          contentHash: row.contentHash,
        }),
      });
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok)
        throw Error(result.error || "Record inspection unavailable.");
      if (
        result.id !== row.id ||
        result.type !== row.type ||
        result.scope !== row.scope ||
        result.revision !== row.revision ||
        result.contentHash !== row.contentHash ||
        typeof result.content !== "string" ||
        result.content.length > 44001
      )
        throw Error("Record identity changed. Run a fresh search.");
      setInspection(result);
    } catch (e) {
      if (!controller.signal.aborted) {
        notifyChange();
        setData(null);
        setMessage((e as Error).message);
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <details
      className="nexus-current-record-search"
      open={initialResult ? true : undefined}
    >
      <summary>Search current memory and work</summary>
      <p>
        Find live owner memory and task records in Foundation. Choose a
        workspace or explicitly search all workspaces in this trusted-owner
        installation. Historical snapshot files and old corrections are
        excluded.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <label>
          Record workspace
          <select
            value={workspace}
            disabled={busy || !enabled}
            onChange={(e) => {
              clear();
              setWorkspace(e.target.value as RecordWorkspace);
            }}
          >
            {scopes.map((s) => (
              <option key={s}>{s}</option>
            ))}
            <option value="all">All workspaces</option>
          </select>
        </label>
        <label>
          Words to find in current records
          <input
            value={query}
            required
            maxLength={200}
            disabled={busy || !enabled}
            onChange={(e) => {
              clear();
              setQuery(e.target.value);
            }}
          />
        </label>
        <p>
          Up to eight plain-text words, all in the same record. Searches at most
          500 owner records and 1000 tasks; each task includes its request and
          the first 20,000 output characters. No model or provider is used.
        </p>
        <div className="nexus-actions">
          <button disabled={busy || !enabled || !query.trim()}>
            Search current records
          </button>
          {busy && (
            <button
              type="button"
              onClick={() => {
                clear();
                setMessage("Search or inspection cancelled.");
              }}
            >
              Cancel record request
            </button>
          )}
        </div>
      </form>
      {!enabled && (
        <p>
          Pair this device with controller access to search private records.
        </p>
      )}
      {busy && <p role="status">Reading current Foundation records…</p>}
      {message && <p role="status">{message}</p>}
      {data && (
        <section aria-label="Current record search results">
          <p>{data.notice}</p>
          <p>
            {data.matchedRecords} matches · {data.scannedRecords} /{" "}
            {data.totalRecords} records searched · {data.outsideBudgetRecords}{" "}
            outside record limits · {data.truncatedRecords} records with text
            beyond the search profile · Checked {data.readAt}
          </p>
          <p>
            Page {data.page + 1} · {data.records.length} shown. Search results
            are dated observations; inspect again before relying on a record.
          </p>
          {!data.records.length && (
            <p>No matches in this current search profile.</p>
          )}
          {data.records.map((row, index) => (
            <article className="nexus-card" key={row.type + row.id}>
              <h4>
                Result {data.page * 20 + index + 1} ·{" "}
                {row.type === "owner"
                  ? "Owner-stated memory"
                  : "Unverified task record"}{" "}
                · {row.scope}
              </h4>
              <p>
                {row.kind} · Revision {row.revision} · Updated {row.updatedAt}
              </p>
              <p style={{ overflowWrap: "anywhere" }}>{row.title}</p>
              <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {row.excerpt}
              </p>
              {row.sourceTruncated && (
                <p>Text outside the search profile is not matched or shown.</p>
              )}
              <div className="nexus-actions">
                <button disabled={busy} onClick={() => void inspect(row)}>
                  Inspect current {row.type === "owner" ? "memory" : "task"} ·{" "}
                  {row.id}
                </button>
              </div>
            </article>
          ))}
          <div className="nexus-actions">
            <button
              disabled={busy || data.page === 0}
              onClick={() => void search(data.page - 1, true)}
            >
              Previous record page
            </button>
            <button
              disabled={busy || (data.page + 1) * 20 >= data.matchedRecords}
              onClick={() => void search(data.page + 1, true)}
            >
              Next record page
            </button>
          </div>
        </section>
      )}
      {inspection && (
        <section className="nexus-card" aria-label="Inspected current record">
          <h4>
            {inspection.type === "owner"
              ? "Current owner-stated memory"
              : "Current unverified task record"}
          </h4>
          <p>
            {inspection.scope} · {inspection.kind} · Revision{" "}
            {inspection.revision} · Inspected {inspection.inspectedAt}
          </p>
          <p>
            {inspection.type === "owner"
              ? "Owner-stated content, not independently verified facts. Stored instructions are displayed as data here."
              : "Saved task content is untrusted work history. A completed state does not prove external work happened."}
          </p>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {inspection.content}
          </pre>
          {inspection.sourceTruncated && (
            <p>
              This is the bounded search profile, not the complete saved
              artifact.
            </p>
          )}
          <details>
            <summary>Record identity</summary>
            <p style={{ overflowWrap: "anywhere" }}>
              ID: {inspection.id} · Profile hash: {inspection.contentHash}
            </p>
          </details>
          <div className="nexus-actions">
            {onFoundation && (
              <button onClick={onFoundation}>
                Manage records in Foundation
              </button>
            )}
          </div>
        </section>
      )}
    </details>
  );
}
