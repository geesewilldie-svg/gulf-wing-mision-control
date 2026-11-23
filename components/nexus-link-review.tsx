"use client";
import { useEffect, useRef, useState } from "react";
export type LinkPreview = {
  url: string;
  host: string;
  requestId: string;
  supported: boolean;
  enabled: boolean;
};
export default function NexusLinkReview({
  preview,
  disabled,
}: {
  preview: LinkPreview;
  disabled: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [closed, setClosed] = useState(false),
    [message, setMessage] = useState(""),
    [reference, setReference] = useState("");
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    if (disabled) {
      setClosed(true);
      setMessage("");
      setReference("");
    }
    return () => {
      generation.current++;
    };
  }, [disabled]);
  if (closed || disabled) return null;
  async function open() {
    const current = generation.current;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/sync/web-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: preview.url,
          requestId: preview.requestId,
          confirmed: true,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      if (current === generation.current) {
        setMessage(data.message);
        setReference(data.id);
      }
    } catch (error) {
      if (current === generation.current) setMessage((error as Error).message);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  return (
    <section className="nexus-draft-preview" aria-label="Review laptop link">
      <h4>Open a page on your laptop</h4>
      <p>
        Website: <strong>{preview.host}</strong>
      </p>
      <pre aria-label="Reviewed web address">{preview.url}</pre>
      <p>
        Uses your normal laptop browser. The laptop must be awake and signed in.
        Nexus will not read, click or sign in to the page.
      </p>
      {!preview.supported && <p>Opening links requires the Windows host.</p>}
      {preview.supported && !preview.enabled && (
        <p>
          First run Enable-Nexus-Link-Opening.cmd on the laptop, then ask for
          this link again. This setting is separate from service maintenance.
        </p>
      )}
      <div className="nexus-draft-actions">
        <button
          disabled={
            busy || !preview.supported || !preview.enabled || !!reference
          }
          onClick={() => void open()}
        >
          Open on laptop
        </button>
        <button disabled={busy} onClick={() => setClosed(true)}>
          Dismiss link
        </button>
      </div>
      {message && <p role="status">{message}</p>}
      {reference && (
        <p>
          Operation reference: {reference}. Ask “Show laptop operations” to
          retrieve its saved status.
        </p>
      )}
    </section>
  );
}
