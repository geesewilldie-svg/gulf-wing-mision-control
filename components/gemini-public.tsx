"use client";
import { useEffect, useRef, useState } from "react";
type Status = {
  configured: boolean;
  enabled: boolean;
  supported: boolean;
  policy: string;
  model: string | null;
  dailyLimit: number;
  warning?: string;
};
export default function GeminiPublic({ disabled }: { disabled: boolean }) {
  const [status, setStatus] = useState<Status | null>(null),
    [question, setQuestion] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [answer, setAnswer] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null),
    generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current,
      abort = new AbortController();
    setStatus(null);
    setAnswer("");
    setConfirmed(false);
    setBusy(false);
    setMessage("");
    if (!disabled)
      fetch("/api/sync/gemini-public", { signal: abort.signal })
        .then(async (r) => {
          const d = await r.json();
          if (current !== generation.current) return;
          if (!r.ok) throw Error(d.error);
          setStatus(d);
        })
        .catch((e) => {
          if (e.name !== "AbortError" && current === generation.current)
            setMessage(e.message);
        });
    return () => {
      generation.current++;
      abort.abort();
      request.current?.abort();
    };
  }, [disabled]);
  async function send() {
    if (disabled || busy || !confirmed || !question.trim()) return;
    const current = ++generation.current,
      abort = new AbortController();
    request.current = abort;
    setBusy(true);
    setAnswer("");
    setMessage("");
    setConfirmed(false);
    try {
      const r = await fetch("/api/sync/gemini-public", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, confirmedPublic: true }),
          signal: abort.signal,
        }),
        d = await r.json();
      if (current !== generation.current) return;
      if (!r.ok) throw Error(d.error);
      setAnswer(d.answer);
      setMessage(
        d.engine +
          (d.truncated
            ? " · Output limit reached; ask a shorter public question."
            : ""),
      );
    } catch (e) {
      if (current === generation.current)
        setMessage(
          (e as Error).name === "AbortError"
            ? "Public request stopped. Google may already have received the submitted question."
            : (e as Error).message,
        );
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  return (
    <section className="nexus-card" aria-label="Gemini Public questions">
      <p className="eyebrow">GEMINI / PUBLIC QUESTIONS ONLY</p>
      <h2>Ask a public question.</h2>
      <p>
        Google's unpaid terms allow using submitted content and responses for
        product improvement and human review. Do not type personal, confidential
        or sensitive information here. This box does not retrieve business
        files, Google documents, calendars, owner memory or conversation
        history.
      </p>
      <p>
        Your private business questions stay in Ask Nexus with the local model.
        This public answer is not automatically carried into your business
        conversation or voice assistant.
      </p>
      <p>
        {status?.enabled
          ? "Configured model: " +
            status.model +
            " · up to " +
            status.dailyLimit +
            " generation attempts per UTC day."
          : "Not enabled. On the Windows laptop run Setup-Nexus-Gemini.cmd."}
        {status && !status.supported
          ? " Key unlock requires the Windows laptop host."
          : ""}
      </p>
      {status?.warning && <p role="status">{status.warning}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label>
          Public question
          <textarea
            value={question}
            maxLength={2000}
            disabled={disabled || busy}
            onChange={(e) => {
              setQuestion(e.target.value);
              setConfirmed(false);
            }}
            placeholder="For example: Explain the difference between revenue and profit in general."
          />
        </label>
        <label className="business-check">
          <input
            type="checkbox"
            checked={confirmed}
            disabled={disabled || busy}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          This question contains no personal, confidential or sensitive
          information. Send only this question to Google.
        </label>
        <button
          disabled={
            disabled ||
            busy ||
            !status?.enabled ||
            !status.supported ||
            !confirmed ||
            !question.trim()
          }
        >
          {busy ? "Asking Gemini Public…" : "Ask Gemini Public"}
        </button>
        <button
          type="button"
          disabled={!busy}
          onClick={() => request.current?.abort()}
        >
          Stop public request
        </button>
      </form>
      {answer && (
        <article aria-label="Gemini Public answer">
          <h3>Public answer · verify claims</h3>
          <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {answer}
          </p>
        </article>
      )}
      <p role="status">{message}</p>
      <p>
        This setup does not enable or inspect Google billing. Keep your project
        on Free tier; model availability and Google's quotas/prices can change.
        Ten attempts per day is an application request limit, not a dollar
        spending cap. No search grounding, tools, automatic routing, comparisons
        or private-context Gemini calls are enabled by this setup.
      </p>
      <button
        disabled={disabled || busy || !status?.enabled}
        onClick={async () => {
          try {
            const r = await fetch("/api/sync/gemini-public", {
                method: "DELETE",
              }),
              d = await r.json();
            if (!r.ok) throw Error(d.error);
            setStatus(d);
            setAnswer("");
            setMessage(
              "Public Gemini disabled. Private-context Gemini remains blocked by this public-only policy.",
            );
          } catch (e) {
            setMessage((e as Error).message);
          }
        }}
      >
        Disable public Gemini
      </button>
    </section>
  );
}
