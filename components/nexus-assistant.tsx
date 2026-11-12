"use client";
import { useEffect, useState, useRef, createContext, useContext } from "react";
import { usePathname } from "next/navigation";
import { useWorkspace } from "@/hooks/use-workspace";
import type { KnowledgeDocument } from "@/lib/nexus";
import type { ProviderStatus, AgentResult } from "@/lib/agent-router";
import type { ConversationTurn } from "@/lib/conversation";
import { scopes, type Scope } from "@/lib/foundation/contracts";
import NexusVoice from "./nexus-voice";
const AssistantContext = createContext({
  conversationActive: false,
  openAssistant: () => {},
});
export const useNexusAssistant = () => useContext(AssistantContext);
type Answer = {
  engine: string;
  answer: string;
  sources: KnowledgeDocument[];
  warnings?: string[];
  agents?: AgentResult[];
  routing?: { reason: string };
};
export default function NexusAssistant({
  children,
}: {
  children: React.ReactNode;
}) {
  const { sync } = useWorkspace();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const tab = "Assistant";
  const presentation =
    pathname === "/display" || pathname.startsWith("/estimate/");
  const [workspaceScope, setWorkspaceScope] = useState<Scope>("Personal");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("auto");
  const [allowExternal, setAllowExternal] = useState(false);
  const [publicQuery, setPublicQuery] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const pendingAnswer = useRef<AbortController | null>(null);
  useEffect(() => () => pendingAnswer.current?.abort(), []);
  const [conversationActive, setConversationActive] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<{
    sections: number;
    sources: string[];
    localModel: boolean;
    providers?: ProviderStatus[];
    obsidian?: boolean;
    webProvider?: string;
  } | null>(null);
  const disabled =
    presentation ||
    sync.mode !== "shared" ||
    sync.role === "display" ||
    sync.needsPair;
  useEffect(() => {
    if (disabled) {
      setStatus(null);
      return;
    }
    const abort = new AbortController();
    fetch("/api/sync/nexus", { signal: abort.signal })
      .then(async (r) => {
        if (r.ok) setStatus(await r.json());
      })
      .catch(() => {});
    return () => abort.abort();
  }, [disabled]);
  useEffect(() => {
    if (disabled) {
      pendingAnswer.current?.abort();
      setAnswer(null);
      setQuery("");
      setMessage("");
      setAllowExternal(false);
      setPublicQuery("");
    }
  }, [disabled]);
  const ask = async (
    text: string,
    history: ConversationTurn[] = [],
    signal?: AbortSignal,
  ) => {
    const controller = signal ? null : new AbortController();
    if (controller) pendingAnswer.current = controller;
    const requestSignal = signal || controller!.signal;
    setBusy(true);
    setAnswer(null);
    setMessage("");
    setAllowExternal(false);
    setPublicQuery("");
    try {
      const r = await fetch("/api/sync/nexus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: text,
          workspaceScope,
          mode,
          history,
          allowExternal,
          publicQuery,
        }),
        signal: requestSignal,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      if (requestSignal.aborted)
        throw new DOMException("Stopped", "AbortError");
      setAnswer(data);
      return data.answer as string;
    } catch (e) {
      if ((e as Error).name !== "AbortError") setMessage((e as Error).message);
      throw e;
    } finally {
      if (controller && pendingAnswer.current === controller)
        pendingAnswer.current = null;
      setBusy(false);
    }
  };
  return (
    <AssistantContext.Provider
      value={{ conversationActive, openAssistant: () => setOpen(true) }}
    >
      <div
        className={
          "nexus-app-frame" +
          (pathname === "/" ? " nexus-route-dashboard" : "") +
          (open && !presentation ? " assistant-is-open" : "")
        }
      >
        {children}
        <aside
          className="nexus-assistant-drawer nexus-card"
          aria-label="Nexus personal assistant"
          hidden={!open || presentation}
        >
          <header className="assistant-title">
            <div>
              <span className="assistant-eyebrow">PERSONAL ASSISTANT</span>
              <h2>
                Nexus<span>●</span>
              </h2>
            </div>
            <button
              type="button"
              disabled={disabled || (busy && !conversationActive)}
              onClick={() =>
                window.dispatchEvent(
                  new Event(
                    conversationActive
                      ? "nexus:voice-mute"
                      : "nexus:voice-start",
                  ),
                )
              }
            >
              {conversationActive ? "Mute voice" : "Start voice"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Minimize Nexus assistant"
            >
              −
            </button>
          </header>
          <p className="assistant-presence">
            {conversationActive
              ? "Voice session active · mute below"
              : "Ready when you are · microphone off"}
          </p>
          <p className="assistant-hint">
            Talk or type while you work. Start voice for a hands-free
            conversation.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask(query).catch(() => {});
            }}
          >
            <label htmlFor="nexus-assistant-question">Ask Nexus</label>
            <textarea
              id="nexus-assistant-question"
              aria-label="Ask Nexus"
              required
              maxLength={2000}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What would you like to work on?"
            />
            <button disabled={disabled || busy || conversationActive}>
              {busy ? "Working…" : "Ask Nexus"}
            </button>
            {busy && !conversationActive && (
              <button
                type="button"
                onClick={() => pendingAnswer.current?.abort()}
              >
                Cancel answer
              </button>
            )}
            <details className="assistant-settings">
              <summary>Answer settings and sharing</summary>{" "}
              <label>
                Routing
                <select
                  aria-label="Routing"
                  disabled={conversationActive}
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                >
                  <option value="auto">
                    Auto — local first, permitted agents only
                  </option>
                  <option value="knowledge">Knowledge only — no model</option>
                  <option value="local">Choose agent — local Ollama</option>
                  <option value="compare">
                    Compare answers — up to two permitted models
                  </option>
                  {(status?.providers ?? [])
                    .filter((p) => p.external)
                    .map((p) => (
                      <option key={p.id} value={p.id} disabled={!p.configured}>
                        {p.name}
                        {p.configured ? "" : " — disabled"}
                      </option>
                    ))}
                </select>
              </label>
              <label className="nexus-sharing">
                <input
                  type="checkbox"
                  checked={allowExternal}
                  disabled={busy || conversationActive}
                  onChange={(e) => setAllowExternal(e.target.checked)}
                />
                Allow configured external models to receive my question,
                selected private excerpts and recent conversation for the next
                answer. Provider billing may apply. Off by default.
              </label>
              <label>
                Optional public research terms
                <input
                  maxLength={300}
                  value={publicQuery}
                  disabled={busy || conversationActive}
                  onChange={(e) => setPublicQuery(e.target.value)}
                  placeholder="Public terms only — sent to the research source when you ask"
                />
              </label>
              <p className="nexus-router-note">
                Research source:{" "}
                {status?.webProvider || "English Wikipedia (encyclopedia only)"}
                . Leave blank to avoid public research requests. External
                sharing and public terms reset after each question.
              </p>
            </details>{" "}
          </form>
          {answer && (
            <article className="nexus-answer">
              <h3>{answer.engine}</h3>
              <p>{answer.answer}</p>
              {answer.agents?.length ? (
                <p className="nexus-router-note">
                  Answered by:{" "}
                  {answer.agents
                    .filter((a) => a.answer)
                    .map((a) => a.name)
                    .join(", ")}
                  . Verify generated claims against the sources.
                </p>
              ) : null}
              {answer.routing && (
                <p className="nexus-router-note">{answer.routing.reason}</p>
              )}
              {answer.warnings?.map((w) => (
                <p className="nexus-router-note" key={w}>
                  {w}
                </p>
              ))}
              {answer.agents && answer.agents.length > 1 && (
                <details>
                  <summary>Individual agent responses</summary>
                  {answer.agents.map((a) => (
                    <section key={a.provider}>
                      <h4>{a.name}</h4>
                      <p>{a.answer || a.error}</p>
                    </section>
                  ))}
                </details>
              )}
              <h4>
                Retrieved sources · verify generated claims against these
                passages
              </h4>
              {answer.sources.map((source, i) => (
                <details key={source.id}>
                  <summary>
                    [{i + 1}] {source.source} · {source.location}
                  </summary>
                  {/^(https?:)\/\//.test(source.location) && (
                    <a
                      href={source.location}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open public source ↗
                    </a>
                  )}
                  <p>{source.text}</p>
                </details>
              ))}
            </article>
          )}

          <NexusVoice
            disabled={disabled}
            section={tab}
            answer={answer?.answer ?? ""}
            onTranscript={setQuery}
            onAsk={(text, history, signal) => {
              setQuery(text);
              if (
                /\b(read|give|show|what)\b.*\b(morning|daily) brief\b/i.test(
                  text,
                )
              ) {
                return fetch("/api/sync/brief/morning", { signal }).then(
                  async (r) => {
                    const d = await r.json();
                    if (!r.ok) throw Error(d.error);
                    return (
                      d.brief?.text ||
                      "No saved morning brief is available. Enable local weekday briefs in Daily brief settings."
                    );
                  },
                );
              }
              return ask(text, history, signal);
            }}
            onConversationActive={setConversationActive}
          />
          <details>
            <summary>Memory workspace</summary>
            <label>
              Owner memory workspace{" "}
              <select
                disabled={conversationActive || busy}
                value={workspaceScope}
                onChange={(e) => setWorkspaceScope(e.target.value as Scope)}
              >
                {scopes.map((scope) => (
                  <option key={scope}>{scope}</option>
                ))}
              </select>
            </label>
          </details>
          {disabled && (
            <p>
              Connect this device as a controller to use private assistant
              features.
            </p>
          )}
          <p role="status">{message}</p>
        </aside>
        {!presentation && (
          <button
            className={
              "nexus-assistant-launcher" +
              (conversationActive ? " is-listening" : "")
            }
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {conversationActive ? "● Nexus · Voice active" : "✦ Talk to Nexus"}
            {open ? " · Minimize" : ""}
          </button>
        )}
      </div>
    </AssistantContext.Provider>
  );
}
