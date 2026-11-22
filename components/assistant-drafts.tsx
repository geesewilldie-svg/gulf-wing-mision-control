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
    [drafts, setDrafts] = useState<Draft[]>([]);
  const key = useRef<string | undefined>(undefined),
    version = useRef(0),
    editor = useRef<HTMLTextAreaElement>(null);
  const [source, setSource] = useState<{ id: string; hash: string } | null>(
    null,
  );
  const [readBack, setReadBack] = useState<ReadBack | null>(null);
  useEffect(() => {
    if (open) {
      editor.current?.scrollIntoView({ block: "center" });
      editor.current?.focus();
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
      if (current === version.current) setDrafts(data.drafts);
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
          "The save request returned, but the file could not be independently checked. Inspect Saved drafts before retrying.",
        );
      if (
        verified.draft.text !== reviewedText ||
        verified.draft.verifiedBytes !== reviewedBytes
      )
        throw Error(
          "A file was returned, but its read-back differs from the reviewed text. Nothing else was written. Inspect Saved drafts before retrying.",
        );
      if (current === version.current) {
        setDrafts((previous) => [
          { ...verified.draft, verified: true },
          ...previous.filter((draft) => draft.id !== data.draft.id),
        ]);
        setMessage(
          `Draft file saved and read back successfully: ${reviewedBytes} verified bytes. Its contents have not been fact-checked.`,
        );
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
    <section aria-label="Draft files">
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
        Review answer as draft
      </button>
      <button disabled={disabled || busy} onClick={() => void list()}>
        Saved drafts
      </button>
      {open && !disabled && (
        <div>
          <h3>
            {source
              ? "Review a revised copy"
              : "Draft editor — edit file text here"}
          </h3>
          <p>
            Review the exact text. Confirming creates a new .md file in the
            laptop’s Nexus output folder, not your selected source folders. No
            existing file will be overwritten.
          </p>
          <label>
            Draft title
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
            Draft text
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
          <p>
            {new TextEncoder().encode(content).length} / 40,000 UTF-8 bytes ·
            workspace: {scope}
          </p>
          <button
            disabled={
              busy ||
              !title.trim() ||
              !content.trim() ||
              new TextEncoder().encode(content).length > 40000
            }
            onClick={() => void save()}
          >
            Confirm and save draft file
          </button>
          <button disabled={busy} onClick={() => setOpen(false)}>
            Cancel draft
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
      {!disabled && readBack && (
        <section aria-label="Saved file read-back">
          <h3>Saved file: {readBack.title}</h3>
          <p>
            {readBack.verifiedBytes} verified bytes · recorded size:{" "}
            {readBack.recordedBytes} bytes
          </p>
          {readBack.sizeWarning && <p role="status">{readBack.sizeWarning}</p>}
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {readBack.text}
          </pre>
        </section>
      )}
      {!disabled &&
        drafts.map((draft) => (
          <p key={draft.id}>
            <a href={`/api/sync/drafts?id=${draft.id}`} download>
              Download draft: {draft.title}
            </a>{" "}
            · {draft.bytes} bytes ({draft.verified ? "verified" : "recorded"})
            <button
              disabled={disabled || busy}
              onClick={() => void inspect(draft.id)}
            >
              Inspect saved text: {draft.title}
            </button>
            <button
              disabled={disabled || busy}
              onClick={() => void revise(draft.id)}
            >
              Revise copy: {draft.title}
            </button>
          </p>
        ))}
    </section>
  );
}
