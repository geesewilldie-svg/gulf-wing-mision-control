"use client";
import { useEffect, useState, useRef } from "react";
import { connections, type KnowledgeDocument } from "@/lib/nexus";
import { useWorkspace } from "@/hooks/use-workspace";
import { toolInventory } from "@/lib/tool-inventory";
import NexusAgentActivity from "./nexus-agent-activity";
import type { ProviderStatus, AgentResult } from "@/lib/agent-router";
import NexusVoice from "./nexus-voice";
import type { ConversationTurn } from "@/lib/conversation";
import NexusBusiness from "./nexus-business";
import KnowledgeImport from "./knowledge-import";
import NexusFoundation from "./nexus-foundation";
import { scopes, type Scope } from "@/lib/foundation/contracts";
import GoogleCalendar from "./google-calendar";
import GoogleDrive from "./google-drive";
import LocalFileSearch from "./local-file-search";
import LaptopMaintenance from "./laptop-maintenance";
import MorningBriefNotice from "./morning-brief";
import DailyBrief from "./daily-brief";
import TeamAccess from "./team-access";
import SyncControls from "./sync-controls";

type Answer = {
  engine: string;
  answer: string;
  sources: KnowledgeDocument[];
  warnings?: string[];
  agents?: AgentResult[];
  routing?: { reason: string };
};
export default function NexusConsole() {
  const { sync } = useWorkspace();
  const [tab, setTab] = useState("Ask Nexus");
  useEffect(() => {
    if (
      new URLSearchParams(window.location.search).get("section") === "cohosting"
    )
      setTab("Co-hosting");
  }, []);
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
      <label className="nexus-scope">
        Owner memory workspace{" "}
        <select
          value={workspaceScope}
          onChange={(e) => setWorkspaceScope(e.target.value as Scope)}
        >
          {scopes.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <MorningBriefNotice
        disabled={disabled}
        voiceActive={conversationActive}
      />
      <TeamAccess disabled={disabled} />
      <p className="nexus-notice">
        {disabled
          ? "Pair as a controller through Connect devices to use private knowledge and operating records."
          : "Private laptop workspace · Connected controller"}{" "}
        · Current platform is a business foundation, not a complete accounting
        or property-management system.
      </p>
      <nav className="nexus-tabs" aria-label="Nexus sections">
        {[
          "Ask Nexus",
          "Daily brief",
          "Foundation",
          "Co-hosting",
          "Marketing",
          "Connections",
        ].map((item) => (
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
              Allow configured external models to receive my question, selected
              private excerpts and recent conversation for the next answer.
              Provider billing may apply. Off by default.
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
              {status?.webProvider || "English Wikipedia (encyclopedia only)"}.
              Leave blank to avoid public research requests. External sharing
              and public terms reset after each question.
            </p>
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
            {busy && !conversationActive && (
              <button
                type="button"
                onClick={() => pendingAnswer.current?.abort()}
              >
                Cancel answer
              </button>
            )}
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
            if (
              /\b(read|give|show|what)\b.*\b(morning|daily) brief\b/i.test(text)
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
      </section>
      {tab === "Foundation" && <NexusFoundation disabled={disabled} />}
      {tab === "Daily brief" && <DailyBrief disabled={disabled} />}
      {tab === "Co-hosting" && <NexusBusiness disabled={disabled} />}
      {tab === "Marketing" && <NexusBusiness marketing disabled={disabled} />}
      {tab === "Connections" && (
        <section className="nexus-card">
          <h2>Connections and agents</h2>
          <LocalFileSearch disabled={disabled} />
          <GoogleCalendar disabled={disabled} />
          <GoogleDrive disabled={disabled} />
          <LaptopMaintenance disabled={disabled} />
          <p>
            Local-first routing is available. OpenAI, Claude and Gemini adapters
            require explicit server configuration and per-question sharing
            permission. Existing chat subscriptions do not grant API access. No
            paid service or credential has been enabled for you.
          </p>
          <details className="nexus-tool-inventory">
            <summary>Downloaded tools — setup and connection status</summary>
            <p>
              These websites were supplied by you. Listing a tool does not
              verify its publisher, detect a local installation or connect it to
              Nexus. Cursor is a development companion; the others remain
              evaluation candidates.
            </p>
            <div className="nexus-connections">
              {toolInventory.map((tool) => (
                <article key={tool.name}>
                  <h3>{tool.name}</h3>
                  <strong>{tool.status}</strong>
                  <p>{tool.role}</p>
                  <p>{tool.next}</p>
                  <a href={tool.url} target="_blank" rel="noopener noreferrer">
                    Provided {tool.name} website ↗
                  </a>
                </article>
              ))}
            </div>
            <p>
              On the laptop, run <code>npm.cmd run connections:check</code> in
              Setup &amp; Diagnostics. This makes local checks only and does not
              activate external providers.
            </p>
          </details>
          <div className="nexus-connections">
            <article>
              <h3>Local knowledge / Obsidian</h3>
              <strong>
                {status?.sections ? "Imported snapshot" : "Not imported"}
              </strong>
              <p>
                {status?.obsidian
                  ? "Configured vault is read again for each question within scan limits. Imported snapshots are retained."
                  : "Read-only imported snapshots. Optional host vault configuration enables fresh Markdown reads per question."}
              </p>
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
            {status?.providers
              ?.filter((p) => p.external)
              .map((p) => (
                <article key={p.id}>
                  <h3>{p.name}</h3>
                  <strong>
                    {p.configured
                      ? "Configured — availability unverified"
                      : "Not connected"}
                  </strong>
                  <p>{p.detail}</p>
                </article>
              ))}
            {connections
              .filter(
                ([name]) => !["ChatGPT", "Claude", "Gemini"].includes(name),
              )
              .map(([name, role, setup]) => (
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
      <NexusAgentActivity enabled={!disabled} />
      <p role="status" className="nexus-message">
        {message}
      </p>
    </main>
  );
}
