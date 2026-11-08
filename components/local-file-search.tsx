"use client";
import { useEffect, useState, useRef } from "react";
import type { FileSearchStatus } from "@/lib/local-files";
import type { KnowledgeDocument } from "@/lib/nexus";
type Match = KnowledgeDocument & { fileId: string };
type Preview = {
  name: string;
  modifiedAt: string;
  scannedAt: string;
  sections: KnowledgeDocument[];
  partial: boolean;
};
export default function LocalFileSearch({ disabled }: { disabled: boolean }) {
  const generation = useRef(0);
  const [status, setStatus] = useState<FileSearchStatus | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [query, setQuery] = useState(""),
    [matches, setMatches] = useState<Match[]>([]),
    [preview, setPreview] = useState<Preview | null>(null);
  useEffect(() => {
    const current = ++generation.current;
    setBusy(false);
    setStatus(null);
    setMatches([]);
    setPreview(null);
    setMessage("");
    if (disabled) return;
    const controller = new AbortController();
    fetch("/api/sync/files", { signal: controller.signal })
      .then(async (r) => {
        const d = await r.json();
        if (current !== generation.current) return;
        if (!r.ok) throw Error(d.error);
        setStatus(d);
      })
      .catch((e) => {
        if (current === generation.current && e.name !== "AbortError")
          setMessage(e.message);
      });
    return () => {
      generation.current++;
      controller.abort();
    };
  }, [disabled]);
  async function run(action: string, extra: Record<string, string> = {}) {
    if (disabled || busy) return;
    const current = ++generation.current;
    setBusy(true);
    setMessage("");
    setPreview(null);
    if (action !== "preview") setMatches([]);
    try {
      const r = await fetch("/api/sync/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const d = await r.json();
      if (current !== generation.current) return;
      if (!r.ok) throw Error(d.error);
      if (action === "search") {
        setStatus(d.status);
        setMatches(d.matches);
        setMessage(
          d.matches.length
            ? "Matching local excerpts. Open a source preview below."
            : "No matching indexed text. Refresh the index or try other words.",
        );
      } else if (action === "preview") setPreview(d);
      else {
        setStatus(d);
        setMessage(
          action === "remove"
            ? "Folder removed and connected-file snapshot cleared. Original files and separately imported knowledge are unchanged. Refresh remaining folders."
            : "File index refreshed. Check partial results and skipped files below.",
        );
      }
    } catch (e) {
      if (current === generation.current) setMessage((e as Error).message);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  return (
    <section className="nexus-card" aria-label="Laptop files and Obsidian">
      <h3>Laptop files and Obsidian</h3>
      <p>
        Select a folder on the Windows laptop with{" "}
        <code>Setup-Nexus-Folders.cmd</code>. Choose up to four business folders
        or Obsidian vaults. All paired controllers can search and preview these
        sources.
      </p>
      <p>
        Read-only local snapshots: Markdown, text, PDF and XLSX (Obsidian:
        Markdown only). Hidden files, credential-like names, application folders
        and links are excluded. Scanned PDFs need OCR. Spreadsheet formulas are
        not recalculated.
      </p>
      <button disabled={disabled || busy} onClick={() => run("refresh")}>
        {busy ? "Working on local files…" : "Refresh file index"}
      </button>
      {status && (
        <>
          <p>
            {status.roots.length} selected folders · {status.files} readable
            indexed files · {status.stale} changed/unavailable files withheld.
          </p>
          <p>
            {status.scannedAt
              ? "Last refresh: " + new Date(status.scannedAt).toLocaleString()
              : "No folder index yet. Select a folder, then refresh."}
          </p>
          {status.warning && <p role="status">{status.warning}</p>}
          <ul>
            {status.roots.map((root) => (
              <li key={root.id}>
                <strong>{root.label}</strong> · {root.kind}{" "}
                <button
                  disabled={disabled || busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Remove this folder from connected search and clear its snapshot? Original files stay unchanged.",
                      )
                    )
                      void run("remove", { id: root.id });
                  }}
                >
                  Remove folder · {root.label}
                </button>
              </li>
            ))}
          </ul>
          {status.scans.map((scan) => (
            <article key={scan.rootId}>
              <h4>
                {scan.label} ·{" "}
                {scan.partial ? "Partial index" : "Scan finished within limits"}
              </h4>
              <p>
                {scan.indexed} indexed · {scan.skipped}{" "}
                skipped/excluded/unsupported entries
              </p>
              {scan.issues.map((issue, i) => (
                <p key={i}>{issue}</p>
              ))}
            </article>
          ))}
        </>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run("search", { query });
        }}
      >
        <label>
          Search selected laptop files
          <input
            type="search"
            value={query}
            maxLength={2000}
            disabled={disabled || busy}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button disabled={disabled || busy || !query.trim()}>
          Search file index
        </button>
      </form>
      <p role="status">{message}</p>
      <ul>
        {matches.map((match) => (
          <li key={match.id}>
            <strong>{match.source}</strong>
            <p>{match.location}</p>
            <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {match.text.slice(0, 1000)}
            </p>
            <button
              disabled={disabled || busy}
              onClick={() => run("preview", { id: match.fileId })}
            >
              Preview source · {match.source}
            </button>
          </li>
        ))}
      </ul>
      {preview && (
        <section aria-label="Local source preview">
          <h4>{preview.name}</h4>
          <p>
            Source modified: {new Date(preview.modifiedAt).toLocaleString()} ·
            Indexed: {new Date(preview.scannedAt).toLocaleString()}
          </p>
          {preview.sections.map((s) => (
            <details key={s.id} open>
              <summary>{s.location}</summary>
              <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {s.text}
              </p>
            </details>
          ))}
          {preview.partial && (
            <p>Preview limited to the first eight sections.</p>
          )}
        </section>
      )}
      <p>
        Ask Nexus also searches this index. Refresh after edits; changed or
        missing sources are withheld. Selected excerpts can reach external
        agents only when you allow external sharing for that question. Removing
        a folder does not erase earlier answers or separately imported backups.
        No original file is edited, moved or deleted.
      </p>
    </section>
  );
}
