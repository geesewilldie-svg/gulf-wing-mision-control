"use client";
import { useEffect, useState } from "react";
import { connections, type KnowledgeDocument } from "@/lib/nexus";
import { useWorkspace } from "@/hooks/use-workspace";
import NexusVoice from "./nexus-voice";
import NexusBusiness from "./nexus-business";
import SyncControls from "./sync-controls";

type Answer = { engine: string; answer: string; sources: KnowledgeDocument[] };
export default function NexusConsole() {
  const { sync } = useWorkspace();
  const [tab, setTab] = useState("Ask Nexus");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("auto");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<{
    sections: number;
    sources: string[];
    localModel: boolean;
  } | null>(null);
  const disabled = sync.mode !== "shared" || sync.role === "display";
  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/sync/nexus", { signal: abort.signal })
      .then(async (r) => {
        if (r.ok) setStatus(await r.json());
      })
      .catch(() => {});
    return () => abort.abort();
  }, [sync.mode]);
  const ask = async () => {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/sync/nexus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, mode }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setAnswer(data);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const importFile = async (file: File) => {
    setBusy(true);
    setMessage("");
    try {
      if (file.size > 1900000)
        throw new Error("Use a knowledge pack below 1.9 MB.");
      const text = await file.text();
      const docs = file.name.endsWith(".json")
        ? JSON.parse(text)
        : [
            {
              id: file.name,
              source: file.name,
              location: "Imported note",
              text,
            },
          ];
      if (
        !window.confirm(
          "Replace the private knowledge index with this file? Source files are not changed.",
        )
      )
        return;
      const r = await fetch("/api/sync/nexus", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(docs),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setMessage(`Imported ${data.sections} private sections.`);
      const state = await fetch("/api/sync/nexus");
      if (state.ok) setStatus(await state.json());
    } catch (e) {
      setMessage((e as Error).message);
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
              ? `${status.sections} private knowledge sections · Local model ${status.localModel ? "available" : "not connected"}`
              : "Pair to load knowledge status."}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask();
            }}
          >
            <label>
              Routing
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
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
            <button disabled={disabled || busy}>
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
          <NexusVoice
            disabled={disabled}
            answer={answer?.answer ?? ""}
            onTranscript={setQuery}
          />
          <details>
            <summary>Import business plans or Obsidian knowledge</summary>
            <p>
              Import a prepared JSON knowledge pack or a single Markdown/text
              note. This replaces the current index and stays on the laptop,
              outside Git. For a whole Obsidian vault, use the documented local
              importer. PDFs and Excel files require the prepared extraction
              pack.
            </p>
            <label>
              Knowledge file
              <input
                type="file"
                accept=".json,.md,.txt"
                disabled={disabled || busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void importFile(file);
                  e.target.value = "";
                }}
              />
            </label>
            <ul>
              {status?.sources.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </details>
        </section>
      )}
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
