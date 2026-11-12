"use client";
import { useEffect, useState } from "react";
import { connections } from "@/lib/nexus";
import { useWorkspace } from "@/hooks/use-workspace";
import { toolInventory } from "@/lib/tool-inventory";
import NexusAgentActivity from "./nexus-agent-activity";
import type { ProviderStatus } from "@/lib/agent-router";
import NexusBusiness from "./nexus-business";
import KnowledgeImport from "./knowledge-import";
import NexusFoundation from "./nexus-foundation";
import GoogleCalendar from "./google-calendar";
import GoogleDrive from "./google-drive";
import GeminiPublic from "./gemini-public";
import LocalFileSearch from "./local-file-search";
import LaptopMaintenance from "./laptop-maintenance";
import MorningBriefNotice from "./morning-brief";
import DailyBrief from "./daily-brief";
import TeamAccess from "./team-access";
import SyncControls from "./sync-controls";

import Link from "next/link";
import { useNexusAssistant } from "./nexus-assistant";
export default function NexusConsole() {
  const { sync } = useWorkspace();
  const { conversationActive, openAssistant } = useNexusAssistant();
  const [tab, setTab] = useState("Overview");
  const [connection, setConnection] = useState("Google accounts");
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
    if (
      new URLSearchParams(window.location.search).get("section") === "cohosting"
    )
      setTab("Co-hosting");
  }, []);
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
  return (
    <main className="nexus-console nexus-redesign">
      <header className="nexus-heading">
        <Link href="/">← Mission Control</Link>
        <span>YOUR PERSONAL COMMAND CENTER</span>
        <h1>
          Nexus<span>.</span>
        </h1>
        <p>One assistant. Your day, your work, your knowledge.</p>
      </header>
      <nav className="nexus-tabs" aria-label="Nexus sections">
        {[
          "Overview",
          "Daily brief",
          "Co-hosting",
          "Marketing",
          "Foundation",
          "Knowledge",
          "Connections",
          "Gemini Public",
        ].map((item) => (
          <button
            key={item}
            aria-pressed={tab === item}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </nav>
      {disabled && (
        <section className="nexus-card">
          <h2>Connect your device</h2>
          <p>
            Pair with your laptop to use private tasks, knowledge and voice.
          </p>
          <SyncControls />
        </section>
      )}
      <MorningBriefNotice
        disabled={disabled}
        voiceActive={conversationActive}
      />
      {tab === "Overview" && (
        <section className="nexus-card nexus-overview">
          <span className="assistant-eyebrow">START HERE</span>
          <h2>What needs your attention?</h2>
          <p>
            Keep Nexus beside you while you plan your day or manage your
            business.
          </p>
          <div className="nexus-quick-actions">
            <button onClick={openAssistant}>Talk to Nexus</button>
            <button onClick={() => setTab("Daily brief")}>Review my day</button>
            <button onClick={() => setTab("Co-hosting")}>
              Open co-hosting
            </button>
          </div>
          <div className="nexus-overview-grid">
            <article>
              <h3>Your knowledge</h3>
              <p>
                {status
                  ? `${status.sections} searchable sections`
                  : "Connect this device to load your knowledge."}
              </p>
              <button onClick={() => setTab("Knowledge")}>
                Manage knowledge
              </button>
            </article>
            <article>
              <h3>Your assistant</h3>
              <p>
                {status?.localModel
                  ? "Local model available"
                  : "Local model status unavailable"}
              </p>
              <p>
                {disabled
                  ? "Device connection needed"
                  : "Private controller workspace"}
              </p>
              <button onClick={() => setTab("Connections")}>
                Manage connections
              </button>
            </article>
          </div>
        </section>
      )}
      {tab === "Knowledge" && (
        <section className="nexus-card">
          <h2>Your knowledge</h2>
          <p>
            Import documents here, or manage laptop and Google sources in
            Connections.
          </p>
          <KnowledgeImport
            disabled={disabled || conversationActive}
            sources={status?.sources ?? []}
            onImported={async () => {
              const r = await fetch("/api/sync/nexus");
              if (r.ok) setStatus(await r.json());
            }}
          />
        </section>
      )}
      {tab === "Gemini Public" && <GeminiPublic disabled={disabled} />}
      {tab === "Foundation" && <NexusFoundation disabled={disabled} />}
      {tab === "Daily brief" && <DailyBrief disabled={disabled} />}
      {tab === "Co-hosting" && <NexusBusiness disabled={disabled} />}
      {tab === "Marketing" && <NexusBusiness marketing disabled={disabled} />}
      {tab === "Connections" && (
        <section className="nexus-card">
          <h2>Connections and agents</h2>
          <p>
            Choose what you want to connect. Each section shows its own setup
            and access status.
          </p>
          <nav
            className="nexus-connection-tabs"
            aria-label="Connection categories"
          >
            {[
              "Google accounts",
              "Google files",
              "Laptop files",
              "Device access",
              "Models and tools",
            ].map((item) => (
              <button
                key={item}
                aria-pressed={connection === item}
                onClick={() => setConnection(item)}
              >
                {item}
              </button>
            ))}
          </nav>
          <div hidden={connection !== "Google accounts"}>
            <GoogleCalendar disabled={disabled} />
          </div>
          <div hidden={connection !== "Google files"}>
            <GoogleDrive disabled={disabled} />
          </div>
          <div hidden={connection !== "Laptop files"}>
            <LocalFileSearch disabled={disabled} />
          </div>
          <div hidden={connection !== "Device access"}>
            <SyncControls />
            <TeamAccess disabled={disabled} />
            <LaptopMaintenance disabled={disabled} />
          </div>
          <div hidden={connection !== "Models and tools"}>
            <p>
              Local-first routing is available. OpenAI, Claude and Gemini
              adapters require explicit server configuration and per-question
              sharing permission. Existing chat subscriptions do not grant API
              access. No paid service or credential has been enabled for you.
            </p>
            <details className="nexus-tool-inventory">
              <summary>Downloaded tools — setup and connection status</summary>
              <p>
                These websites were supplied by you. Listing a tool does not
                verify its publisher, detect a local installation or connect it
                to Nexus. Cursor is a development companion; the others remain
                evaluation candidates.
              </p>
              <div className="nexus-connections">
                {toolInventory.map((tool) => (
                  <article key={tool.name}>
                    <h3>{tool.name}</h3>
                    <strong>{tool.status}</strong>
                    <p>{tool.role}</p>
                    <p>{tool.next}</p>
                    <a
                      href={tool.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Provided {tool.name} website ↗
                    </a>
                  </article>
                ))}
              </div>
              <p>
                On the laptop, run <code>npm.cmd run connections:check</code> in
                Setup &amp; Diagnostics. This makes local checks only and does
                not activate external providers.
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
          </div>
        </section>
      )}
      {tab === "Overview" && (
        <details className="nexus-activity-details">
          <summary>Connection activity</summary>
          <NexusAgentActivity enabled={!disabled} />
        </details>
      )}
    </main>
  );
}
