"use client";
import { useEffect, useRef, useState } from "react";
type Draft = { id: string; title: string; bytes: number; verified?: boolean };
type ReadBack = Draft & {
  text: string;
  verifiedBytes: number;
  recordedBytes: number;
  sizeWarning?: string;
};
export default function AssistantDrafts({
  text,
  scope,
  disabled,
  sourceBusy,
}: {
  text: string;
  scope: string;
  disabled: boolean;
  sourceBusy: boolean;
}) {
  const [open, setOpen] = useState(false),
    [title, setTitle] = useState("Nexus draft"),
    [content, setContent] = useState("");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [drafts, setDrafts] = useState<Draft[]>([]),
    [listed, setListed] = useState(false);
  const key = useRef<string | undefined>(undefined),
    version = useRef(0),
    editor = useRef<HTMLTextAreaElement>(null);
  const [source, setSource] = useState<{ id: string; hash: string } | null>(
    null,
  );
  const [readBack, setReadBack] = useState<ReadBack | null>(null);
  useEffect(() => {
    if (open) {
      editor.current
        ?.closest(".nexus-draft-editor")
        ?.scrollIntoView({ block: "start" });
      editor.current?.focus({ preventScroll: true });
    }
  }, [open]);
  useEffect(() => {
    version.current++;
    setBusy(false);
    setOpen(false);
    setContent("");
    setReadBack(null);
    setSource(null);
    setDrafts([]);
    setListed(false);
    setMessage("");
    key.current = undefined;
  }, [disabled, scope]);
  async function inspect(id: string) {
    const current = version.current;
    setReadBack(null);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/sync/drafts?id=${id}&preview=1`),
        data = await response.json();
      if (!response.ok) throw Error(data.error);
      if (current === version.current) {
        setReadBack(data.draft);
        setDrafts((previous) =>
          previous.map((draft) =>
            draft.id === id
              ? { ...draft, bytes: data.draft.verifiedBytes, verified: true }
              : draft,
          ),
        );
      }
    } catch (error) {
      if (current === version.current) setMessage((error as Error).message);
    } finally {
      if (current === version.current) setBusy(false);
    }
  }
  async function revise(id: string) {
    const current = version.current;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/sync/drafts?id=${id}&preview=1`),
        data = await response.json();
      if (!response.ok) throw Error(data.error);
      if (current === version.current) {
        if (data.draft.scope !== scope)
          throw Error("Choose a draft from the current workspace.");
        setTitle(data.draft.title.slice(0, 72) + " revised");
        setContent(data.draft.text);
        setSource({ id: data.draft.id, hash: data.draft.hash });
        key.current = undefined;
        setOpen(true);
      }
    } catch (error) {
      if (current === version.current) setMessage((error as Error).message);
    } finally {
      if (current === version.current) setBusy(false);
    }
  }
  async function list() {
    const current = version.current;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
          `/api/sync/drafts?scope=${encodeURIComponent(scope)}`,
        ),
        data = await response.json();
      if (!response.ok) throw Error(data.error);
      if (current === version.current) {
        setDrafts(data.drafts);
        setListed(true);
      }
    } catch (error) {
      if (current === version.current) setMessage((error as Error).message);
    } finally {
      if (current === version.current) setBusy(false);
    }
  }
  async function save() {
    const current = version.current;
    setReadBack(null);
    const reviewedText = content,
      reviewedBytes = new TextEncoder().encode(reviewedText).length;
    key.current ||= crypto.randomUUID();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/sync/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          text: reviewedText,
          scope,
          requestId: key.current,
          confirmed: true,
          source: source || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      const verification = await fetch(
          `/api/sync/drafts?id=${data.draft.id}&preview=1`,
        ),
        verified = await verification.json();
      if (!verification.ok)
        throw Error(
          "The file may have been saved, but its text could not be checked. Choose Show saved files, then View text before trying again.",
        );
      if (
        verified.draft.text !== reviewedText ||
        verified.draft.verifiedBytes !== reviewedBytes
      )
        throw Error(
          "The saved file differs from the reviewed text. Your edits are still in the editor. Choose Show saved files, then View text before trying again.",
        );
      if (current === version.current) {
        setListed(true);
        setDrafts((previous) => [
          { ...verified.draft, verified: true },
          ...previous.filter((draft) => draft.id !== data.draft.id),
        ]);
        setMessage("File saved. The saved text matches what you reviewed.");
        setReadBack(verified.draft);
        setOpen(false);
      }
    } catch (error) {
      if (current === version.current) setMessage((error as Error).message);
    } finally {
      if (current === version.current) setBusy(false);
    }
  }
  return (
    <section className="nexus-drafts" aria-label="Draft files">
      <header className="nexus-drafts-heading">
        <h3>Your files</h3>
        <p>Save an answer, view a file, or make an edited copy.</p>
      </header>
      <div className="nexus-draft-toolbar">
        <button
          disabled={disabled || busy || sourceBusy || !text}
          onClick={() => {
            setContent(text);
            setSource(null);
            setTitle("Nexus draft");
            key.current = undefined;
            setOpen(true);
            setMessage("");
          }}
        >
          Save this answer
        </button>
        <button disabled={disabled || busy} onClick={() => void list()}>
          Show saved files
        </button>
      </div>
      {open && !disabled && (
        <div className="nexus-draft-editor">
          <p className="nexus-draft-eyebrow">File editor</p>
          <h3>{source ? "Edit a copy" : "Review your file"}</h3>
          <p>
            Edit the title and text below, then choose Save file. A new file
            will be saved on your laptop. Your original stays saved.
          </p>
          <label>
            File title
            <input
              value={title}
              maxLength={80}
              disabled={busy}
              onChange={(event) => {
                setTitle(event.target.value);
                key.current = undefined;
              }}
            />
          </label>
          <label>
            File text
            <textarea
              ref={editor}
              value={content}
              maxLength={40000}
              disabled={busy}
              onChange={(event) => {
                setContent(event.target.value);
                key.current = undefined;
              }}
            />
          </label>
          <p className="nexus-draft-meta">
            {new TextEncoder().encode(content).length} / 40,000 UTF-8 bytes ·
            workspace: {scope}
          </p>
          <div className="nexus-draft-actions">
            <button
              className="nexus-draft-primary"
              disabled={
                busy ||
                !title.trim() ||
                !content.trim() ||
                new TextEncoder().encode(content).length > 40000
              }
              onClick={() => void save()}
            >
              Save file
            </button>
            <button disabled={busy} onClick={() => setOpen(false)}>
              Cancel editing
            </button>
          </div>
        </div>
      )}
      {message && (
        <p className="nexus-draft-status" role="status">
          {message}
        </p>
      )}
      {!disabled && readBack && (
        <section
          className="nexus-draft-preview"
          aria-label="Saved file read-back"
        >
          <h3>File contents</h3>
          <h4>{readBack.title}</h4>
          <p className="nexus-draft-meta">
            Checked file size: {readBack.verifiedBytes} bytes
          </p>
          {readBack.sizeWarning && (
            <p className="nexus-draft-status" role="status">
              {readBack.sizeWarning}
            </p>
          )}
          <pre tabIndex={0} aria-label="Saved file text">
            {readBack.text}
          </pre>
          <details>
            <summary>Size details</summary>
            <p>
              Saved record: {readBack.recordedBytes} bytes. Checked file:{" "}
              {readBack.verifiedBytes} bytes.
            </p>
          </details>
        </section>
      )}
      {!disabled && listed && (
        <div className="nexus-draft-list">
          <h3>Saved files</h3>
          {!drafts.length && <p>No saved files in {scope} yet.</p>}
          {drafts.map((draft) => (
            <article
              className="nexus-draft-file"
              aria-label={draft.title}
              key={draft.id}
            >
              <h4>{draft.title}</h4>
              <p className="nexus-draft-meta">
                {draft.verified ? "Checked size" : "Saved size"}: {draft.bytes}{" "}
                bytes
              </p>
              <div className="nexus-draft-actions">
                <button
                  disabled={disabled || busy}
                  onClick={() => void inspect(draft.id)}
                >
                  View text
                </button>
                <a href={`/api/sync/drafts?id=${draft.id}`} download>
                  Download
                </a>
                <button
                  disabled={disabled || busy}
                  onClick={() => void revise(draft.id)}
                >
                  Edit a copy
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
