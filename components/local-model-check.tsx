"use client";
import { useEffect, useRef, useState } from "react";
import type { LocalModelCheck as Check } from "@/lib/local-model-check";
export default function LocalModelCheck({
  model,
  digest,
  onBusyChange,
}: {
  model: string;
  digest: string;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [result, setResult] = useState<Check | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      pending.current?.abort();
      onBusyChange?.(false);
    },
    [onBusyChange],
  );
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  async function run() {
    if (busy) return;
    const controller = new AbortController();
    pending.current = controller;
    setResult(null);
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/sync/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "local-model-check",
          model,
          digest,
          runTest: true,
        }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok)
        throw Error(data.error || "Local model check unavailable.");
      if (data.model !== model || data.digest !== digest)
        throw Error("The model identity changed. Inspect the catalog again.");
      setResult(data);
    } catch (error) {
      if (!controller.signal.aborted) setError((error as Error).message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <section
      className="nexus-card"
      aria-label={`Local inference check ${model}`}
    >
      <h4>Test this local model</h4>
      <p>
        This loads the model for one fixed diagnostic: “Reply with exactly
        NEXUS_OK and no other text.” It can use laptop RAM/CPU/GPU. No owner
        memory, files or conversation are supplied.
      </p>
      <p>
        Requests 8 output tokens, a 512-token context and immediate unload.
        Stops waiting after 45 seconds; runtime completion or unload can remain
        uncertain after cancellation. No automatic retry.
      </p>
      <div className="nexus-actions">
        <button disabled={busy} onClick={() => void run()}>
          Run local model check · {model}
        </button>
        {busy && (
          <button
            onClick={() => {
              pending.current?.abort();
              setBusy(false);
              setError(
                "Check cancelled. Runtime work may already have occurred; completion and unload are unconfirmed. No automatic retry.",
              );
            }}
          >
            Cancel local model check
          </button>
        )}
      </div>
      {busy && <p role="status">Running the fixed local diagnostic…</p>}
      {error && <p role="status">{error}</p>}
      {result && (
        <section
          aria-label={`Local check result ${model}`}
          className="nexus-hub-result"
        >
          <h4>
            {result.state === "passed"
              ? "Fixed local test passed"
              : "Diagnostic completed; expected marker not returned"}
          </h4>
          <p>{result.notice}</p>
          <p>
            Requested: {result.model} · Reported: {result.reportedModel}
          </p>
          <p>
            Total check elapsed: {result.elapsedMs} ms · Reported output tokens:{" "}
            {result.reportedOutputTokens ?? "Unknown"}
          </p>
          <p>
            Checked {result.checkedAt}. This result applies to this one test.
          </p>
        </section>
      )}
    </section>
  );
}
