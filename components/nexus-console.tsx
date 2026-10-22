"use client";
import { useEffect, useState } from "react";
import { connections, type KnowledgeDocument } from "@/lib/nexus";
import { useWorkspace } from "@/hooks/use-workspace";
import NexusVoice from "./nexus-voice";
import type { ConversationTurn } from "@/lib/conversation";
import NexusBusiness from "./nexus-business";
import KnowledgeImport from "./knowledge-import";
import TeamAccess from "./team-access";
import SyncControls from "./sync-controls";

type Answer = { engine: string; answer: string; sources: KnowledgeDocument[] };
export default function NexusConsole() {
  const { sync } = useWorkspace();
  const [tab, setTab] = useState("Ask Nexus");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("auto");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [conversationActive, setConversationActive] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<{
    sections: number;
    sources: string[];
    localModel: boolean;
  } | null>(null);
  const disabled =
    sync.mode !== "shared" || sync.role === "display" || sync.needsPair;
  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/sync/nexus", { signal: abort.signal })
      .then(async (r) => {
        if (r.ok) setStatus(await r.json());
      })
      .catch(() => {});
    return () => abort.abort();
  }, [sync.mode]);
  const ask = async (
    text: string,
    history: ConversationTurn[] = [],
    signal?: AbortSignal,
  ) => {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/sync/nexus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text, mode, history }),
        signal,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      if (signal?.aborted) throw new DOMException("Stopped", "AbortError");
      setAnswer(data);
      return data.answer as string;
    } catch (e) {
      if ((e as Error).name !== "AbortError") setMessage((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="nexus-console">
      <header className="nexus-heading">
        <a href="/">← Mission Control</a>
        <span>GULF WING / BUSINESS FOUNDATION</span>
        <h1>
          Nexus<span>.</span>
        </h1>
        <p>
          One place to ask, plan and operate. Auto uses configured connections
          only.
        </p>
      </header>
      <SyncControls />
      <TeamAccess disabled={disabled} />
      <p className="nexus-notice">
        {disabled
          ? "Pair as a controller through Connect devices to use private knowledge and operating records."
          : "Private laptop workspace · Connected controller"}{" "}
        · Current platform is a business foundation, not a complete accounting
        or property-management system.
      </p>
      <nav className="nexus-tabs" aria-label="Nexus sections">
        {["Ask Nexus", "Co-hosting", "Marketing", "Connections"].map((item) => (
          <button
            key={item}
            aria-pressed={tab === item}
            onClick={() => {
              setTab(item);
              setMessage("");
            }}
          >
            {item}
          </button>
        ))}
      </nav>
      {tab === "Ask Nexus" && (
        <section className="nexus-card">
          <h2>Your business, in one question.</h2>
          <p>
            {status
              ? `${status.sections} private knowledge sections + saved operating records · Local model ${status.localModel ? "available" : "not connected"}`
              : "Pair to load knowledge status."}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask(query).catch(() => {});
            }}
          >
            <label>
              Routing
              <select
                disabled={conversationActive}
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                <option value="auto">
                  Auto — local model if configured, otherwise document search
                </option>
                <option value="knowledge">Knowledge only — no model</option>
              </select>
            </label>
            <label>
              Ask Nexus
              <textarea
                required
                maxLength={2000}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="What services can Co-hosting offer?"
              />
            </label>
            <button disabled={disabled || busy || conversationActive}>
              {busy ? "Working…" : "Ask Nexus"}
            </button>
          </form>
          {answer && (
            <article className="nexus-answer">
              <h3>{answer.engine}</h3>
              <p>{answer.answer}</p>
              <h4>
                Retrieved sources · verify generated claims against these
                passages
              </h4>
              {answer.sources.map((source, i) => (
                <details key={source.id}>
                  <summary>
                    [{i + 1}] {source.source} · {source.location}
                  </summary>
                  <p>{source.text}</p>
                </details>
              ))}
            </article>
          )}
          <KnowledgeImport
            disabled={disabled || busy || conversationActive}
            sources={status?.sources ?? []}
            onImported={async () => {
              const r = await fetch("/api/sync/nexus");
              if (r.ok) setStatus(await r.json());
            }}
          />
        </section>
      )}
      <section
        className="nexus-card nexus-assistant-card"
        aria-label="Nexus assistant controls"
      >
        <NexusVoice
          disabled={disabled}
          section={tab}
          answer={answer?.answer ?? ""}
          onTranscript={setQuery}
          onAsk={(text, history, signal) => {
            setQuery(text);
            return ask(text, history, signal);
          }}
          onConversationActive={setConversationActive}
        />
      </section>
      {tab === "Co-hosting" && <NexusBusiness disabled={disabled} />}
      {tab === "Marketing" && <NexusBusiness marketing disabled={disabled} />}
      {tab === "Connections" && (
        <section className="nexus-card">
          <h2>Connections and agents</h2>
          <p>
            External adapters are not installed. Existing chat subscriptions do
            not automatically grant API access. No paid services or credentials
            have been added.
          </p>
          <div className="nexus-connections">
            <article>
              <h3>Local knowledge / Obsidian</h3>
              <strong>
                {status?.sections ? "Imported snapshot" : "Not imported"}
              </strong>
              <p>Read-only search of imported notes. No live vault sync.</p>
            </article>
            <article>
              <h3>Local model</h3>
              <strong>
                {status?.localModel ? "Available" : "Not connected"}
              </strong>
              <p>
                Optional Ollama on the laptop. Text-only answers, no action
                tools.
              </p>
            </article>
            {connections.map(([name, role, setup]) => (
              <article key={name}>
                <h3>{name}</h3>
                <strong>Not connected</strong>
                <p>{role}</p>
                <small>{setup}</small>
              </article>
            ))}
          </div>
        </section>
      )}
      <p role="status" className="nexus-message">
        {message}
      </p>
    </main>
  );
}
