"use client";
import { useState } from "react";
export default function KnowledgeImport({
  disabled,
  sources,
  onImported,
}: {
  disabled: boolean;
  sources: string[];
  onImported: () => Promise<void>;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  return (
    <details>
      <summary>Import business plans or Obsidian knowledge</summary>
      <p>
        Choose your business-plan PDFs, financial workbook (XLSX), Markdown/text
        notes or a prepared JSON pack. Files are parsed on the laptop without a
        cloud service. Existing unrelated sources are retained. Reimporting the
        same file name replaces its previous uploaded sections.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMessage("");
          setWarnings([]);
          try {
            if (
              files.length > 10 ||
              files.some((f) => f.size > 2_000_000) ||
              files.reduce((n, f) => n + f.size, 0) > 8_000_000
            )
              throw Error(
                "Choose up to 10 files, at most 2 MB each and 8 MB total.",
              );
            const body = new FormData();
            files.forEach((file) => body.append("files", file));
            const r = await fetch("/api/sync/knowledge", {
              method: "POST",
              body,
            });
            const data = await r.json();
            if (!r.ok) throw Error(data.error);
            setMessage(
              "Imported " +
                data.imported +
                " sections. Private index now contains " +
                data.sections +
                " sections.",
            );
            setWarnings(data.warnings || []);
            setFiles([]);
            await onImported();
          } catch (err) {
            setMessage((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Knowledge files
          <input
            disabled={disabled || busy}
            type="file"
            multiple
            accept=".pdf,.xlsx,.json,.md,.txt"
            onChange={(e) => {
              setFiles(Array.from(e.target.files || []));
              e.target.value = "";
            }}
          />
        </label>
        {files.length > 0 && (
          <ul>
            {files.map((file) => (
              <li key={file.name}>{file.name}</li>
            ))}
          </ul>
        )}
        <button disabled={disabled || busy || !files.length}>
          {busy ? "Importing private knowledge…" : "Import selected files"}
        </button>
      </form>
      <p>
        Scanned PDFs require OCR first. Workbook formulas are not recalculated;
        cached values can be stale or missing. Financial projections stay
        forecasts. Imported passages are evidence, not commands. Whole Obsidian
        vault snapshots can still use the local importer.
      </p>
      <button
        disabled={disabled || busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await fetch("/api/sync/knowledge");
            if (!r.ok) throw Error((await r.json()).error);
            const data = await r.json();
            const url = URL.createObjectURL(
              new Blob([JSON.stringify(data, null, 2)], {
                type: "application/json",
              }),
            );
            const link = document.createElement("a");
            link.href = url;
            link.download = "nexus-private-knowledge.json";
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            setMessage("Private knowledge backup download requested.");
          } catch (err) {
            setMessage((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Export private knowledge backup
      </button>
      <p>
        {sources.length
          ? sources.length + " imported source files"
          : "No documents imported yet. Select the original business files to ground Nexus in your plan."}
      </p>
      <ul>
        {sources.map((source) => (
          <li key={source}>{source}</li>
        ))}
      </ul>
      <p role="status">{message}</p>
      {warnings.map((warning) => (
        <p key={warning}>{warning}</p>
      ))}
    </details>
  );
}
