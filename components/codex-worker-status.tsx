"use client";
import { useEffect, useState } from "react";
export default function CodexWorkerStatus({ disabled }: { disabled: boolean }) {
  const [status, setStatus] = useState<{
      enabled: boolean;
      ready: boolean;
      state: string;
      detail: string;
    } | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function check(signal?: AbortSignal) {
    setBusy(true);
    try {
      const r = await fetch("/api/sync/worker", { signal });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setStatus(d);
      setMessage("");
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        setMessage(
          "Worker status unavailable. Pair as Controller and check local setup.",
        );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (disabled) {
      setStatus(null);
      return;
    }
    const abort = new AbortController();
    void check(abort.signal);
    return () => abort.abort();
  }, [disabled]);
  return (
    <section className="nexus-card" aria-label="Codex development worker">
      <h3>Codex development worker</h3>
      <p>
        {status
          ? status.state + ": " + status.detail
          : "Worker readiness has not been confirmed."}
      </p>
      <button disabled={disabled || busy} onClick={() => check()}>
        {busy ? "Checking worker…" : "Check coding worker readiness"}
      </button>
      <p role="status">{message}</p>
      <p>
        Setup-Nexus-Codex.cmd installs an isolated official CLI and opens
        ChatGPT sign-in on your laptop. Account quota/credits and terms apply.
        Local-only owner memory and account credentials are not included in
        worker prompts. Each cloud attempt needs its own task consent. Generated
        code/tests are not executed automatically.
      </p>
    </section>
  );
}
