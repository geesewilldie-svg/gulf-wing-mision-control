"use client";
import { useEffect, useRef, useState } from "react";
import type { Scope } from "@/lib/foundation/contracts";
type Preview = {
  markdown: string;
  sha256: string;
  exportedAt: string;
  workspace: Scope;
};
export default function VaultNoteReview({
  workspace,
  taskId,
}: {
  workspace: Scope;
  taskId?: string;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setPreview(null);
    setResult("");
    setBusy(false);
    return () => {
      generation.current++;
    };
  }, [workspace, taskId]);
  const kind = taskId ? "work-note" : "owner-memory";
  async function send(save: boolean) {
    const current = ++generation.current;
    setBusy(true);
    setResult("");
    try {
      const response = await fetch("/api/sync/foundation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: save ? "memory.vault.save" : "memory.vault.preview",
          kind,
          scope: workspace,
          taskId,
          ...(save && preview
            ? {
                exportedAt: preview.exportedAt,
                sha256: preview.sha256,
                confirm: true,
              }
            : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Vault request failed.");
      if (current !== generation.current) return;
      if (save) {
        setPreview(null);
        setResult(
          `Vault snapshot saved and read back: ${data.filename}. ${data.indexing === "indexed" ? "Added to the file index. Open the galaxy or use Reload sources to see it." : "Indexing is pending; refresh the laptop file index if it does not appear."}`,
        );
      } else setPreview(data);
    } catch (error) {
      if (current === generation.current) {
        setPreview(null);
        setResult((error as Error).message);
      }
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  return (
    <div className="vault-note-review">
      <button disabled={busy} onClick={() => void send(false)}>
        {taskId
          ? "Review task work note for vault"
          : `Review ${workspace} snapshot for vault`}
      </button>
      {result && (
        <p role="status" style={{ marginBlock: "1rem" }}>
          {result}
        </p>
      )}
      {preview && (
        <section
          aria-label="Review vault memory snapshot"
          className="nexus-card"
        >
          <h4>
            Review {workspace} {taskId ? "task work note" : "memory snapshot"}
          </h4>
          <p>
            Confirm saves this exact text as a new Markdown note under Nexus
            Memory Snapshots. Earlier notes are retained. Later corrections or
            deletion do not update copies. No provider is contacted.
          </p>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              maxHeight: "24rem",
              overflow: "auto",
            }}
          >
            {preview.markdown}
          </pre>
          <div className="foundation-actions">
            <button disabled={busy} onClick={() => void send(true)}>
              Confirm and save new vault snapshot
            </button>
            <button disabled={busy} onClick={() => setPreview(null)}>
              Cancel vault snapshot
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
