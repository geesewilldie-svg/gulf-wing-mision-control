"use client";
import { useEffect, useRef, useState } from "react";
import type { DriveFile, DriveStatus } from "@/lib/google-drive";
import type { KnowledgeDocument } from "@/lib/nexus";
type Account = { id: string; email: string; drive: boolean };
export default function GoogleDrive({ disabled }: { disabled: boolean }) {
  const [accounts, setAccounts] = useState<Account[]>([]),
    [accountId, setAccountId] = useState(""),
    [status, setStatus] = useState<DriveStatus | null>(null),
    [query, setQuery] = useState(""),
    [localQuery, setLocalQuery] = useState(""),
    [files, setFiles] = useState<DriveFile[]>([]),
    [matches, setMatches] = useState<KnowledgeDocument[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current,
      abort = new AbortController();
    setAccounts([]);
    setStatus(null);
    setFiles([]);
    setMatches([]);
    setMessage("");
    setBusy(false);
    if (!disabled)
      Promise.all([
        fetch("/api/sync/google", { signal: abort.signal }),
        fetch("/api/sync/google/drive", { signal: abort.signal }),
      ])
        .then(async ([a, b]) => {
          const first = await a.json(),
            second = await b.json();
          if (current !== generation.current) return;
          if (!a.ok)
            throw Error(first.error || "Google account status unavailable.");
          const ready = (first.accounts || []).filter((x: Account) => x.drive);
          setAccounts(ready);
          setAccountId(ready[0]?.id || "");
          if (!b.ok)
            throw Error(
              second.error ||
                "Drive snapshot unavailable. Refresh selected files.",
            );
          setStatus(second);
        })
        .catch((e) => {
          if (e.name !== "AbortError" && current === generation.current)
            setMessage(e.message);
        });
    return () => {
      generation.current++;
      abort.abort();
    };
  }, [disabled]);
  async function run(action: string, extra: Record<string, string> = {}) {
    if (disabled || busy) return;
    const current = ++generation.current;
    setBusy(true);
    setMessage("");
    setMatches([]);
    try {
      const r = await fetch("/api/sync/google/drive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...extra }),
        }),
        d = await r.json();
      if (current !== generation.current) return;
      if (!r.ok) throw Error(d.error);
      if (action === "browse") {
        setFiles(d.files);
        setMessage(
          (d.partial
            ? "Showing up to 25 files; narrow the name search for more. "
            : "") +
            (d.skipped
              ? d.skipped + " unsupported or oversized files skipped. "
              : "") +
            (!d.files.length ? "No matching supported files found." : ""),
        );
      } else if (action === "search") {
        setMatches(d.matches);
        setMessage(
          d.matches.length
            ? "Matching saved Google excerpts."
            : "No matching indexed text. Select files and refresh first.",
        );
      } else {
        setStatus(d);
        setMessage(
          action === "select"
            ? "File selected. Click Refresh selected Drive files to read its text."
            : action === "remove"
              ? "File removed from selection and Drive cache cleared. Refresh remaining selections."
              : "Drive snapshot refreshed. Review any warnings below.",
        );
      }
    } catch (e) {
      if (current === generation.current) setMessage((e as Error).message);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  return (
    <section
      className="nexus-card"
      aria-label="Google Drive Docs and Sheets"
      style={{ overflowWrap: "anywhere" }}
    >
      <h3>Google Drive, Docs and Sheets</h3>
      <p>
        Read selected Google Docs, all exported Sheets tabs, PDFs, text/Markdown
        and XLSX files. Approve Drive access for an account using the Google
        account controls above, then reload Connections. Google files are never
        edited or deleted here.
      </p>
      <p>
        Google's read-only Drive grant permits seeing/downloading files across
        the account. Only explicitly selected files become local search
        snapshots shared with trusted paired controllers. Gmail, sending,
        calendar edits and marketing accounts are separate.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run("browse", { accountId, query });
        }}
      >
        <label>
          Drive account
          <select
            disabled={disabled || busy || !accounts.length}
            value={accountId}
            onChange={(e) => {
              setAccountId(e.target.value);
              setFiles([]);
            }}
          >
            {!accounts.length && (
              <option value="">No Drive-authorized accounts yet</option>
            )}
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.email}
              </option>
            ))}
          </select>
        </label>
        <label>
          Find Google files by name
          <input
            value={query}
            maxLength={100}
            disabled={disabled || busy}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button disabled={disabled || busy || !accountId}>
          Find Google files
        </button>
      </form>
      <ul>
        {files.map((file) => (
          <li key={file.id}>
            <strong>{file.name}</strong> · {file.mimeType}{" "}
            <a href={file.url} target="_blank" rel="noopener noreferrer">
              Open in Google
            </a>{" "}
            <button
              disabled={
                disabled ||
                busy ||
                status?.selected.some(
                  (s) => s.accountId === accountId && s.fileId === file.id,
                )
              }
              onClick={() => run("select", { accountId, fileId: file.id })}
            >
              Select for Nexus · {file.name}
            </button>
          </li>
        ))}
      </ul>
      <button
        disabled={disabled || busy || !accounts.length}
        onClick={() => run("refresh")}
      >
        {busy ? "Working with Google files…" : "Refresh selected Drive files"}
      </button>
      {status && (
        <>
          <p>
            {status.selected.length} selected files · {status.entries.length}{" "}
            readable cached files ·{" "}
            {status.refreshedAt
              ? "Last refresh: " + new Date(status.refreshedAt).toLocaleString()
              : "No saved Drive snapshot yet."}
          </p>
          <ul>
            {status.selected.map((f) => {
              const entry = status.entries.find(
                (e) => e.accountId === f.accountId && e.fileId === f.fileId,
              );
              return (
                <li key={f.accountId + f.fileId}>
                  {accounts.find((a) => a.id === f.accountId)?.email} ·{" "}
                  {entry?.name || f.fileId}
                  {entry && (
                    <>
                      {" "}
                      · modified {new Date(
                        entry.modifiedAt,
                      ).toLocaleString()}{" "}
                      <a
                        href={entry.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open source in Google
                      </a>
                    </>
                  )}{" "}
                  <button
                    disabled={disabled || busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Remove this file from Nexus selection and clear the Drive cache? Google originals stay unchanged.",
                        )
                      )
                        void run("remove", {
                          accountId: f.accountId,
                          fileId: f.fileId,
                        });
                    }}
                  >
                    Remove Google selection · {entry?.name || f.fileId}
                  </button>
                </li>
              );
            })}
          </ul>
          {status.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run("search", { query: localQuery });
        }}
      >
        <label>
          Search saved Google text
          <input
            value={localQuery}
            maxLength={2000}
            disabled={disabled || busy}
            onChange={(e) => setLocalQuery(e.target.value)}
          />
        </label>
        <button disabled={disabled || busy || !localQuery.trim()}>
          Search saved Google text
        </button>
      </form>
      <p role="status">{message}</p>
      <ul>
        {matches.map((d) => (
          <li key={d.id}>
            <strong>{d.source}</strong>
            <p>{d.location}</p>
            <p style={{ whiteSpace: "pre-wrap" }}>{d.text}</p>
          </li>
        ))}
      </ul>
      <p>
        Ask Nexus searches these saved excerpts too. Refresh manually after
        Google edits, permission changes or reconnection. Sheets formulas are
        not recalculated locally; PDFs may require OCR. Up to 20 files, 2 MB per
        export and 2 million extracted characters. Selected excerpts reach
        external AI providers only with your per-question sharing permission.
      </p>
    </section>
  );
}
