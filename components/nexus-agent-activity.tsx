"use client";
import { useEffect, useState } from "react";
import type { AgentEvent, ProviderStatus } from "@/lib/agent-router";
export default function NexusAgentActivity({ enabled }: { enabled: boolean }) {
  const [state, setState] = useState<{
      providers: ProviderStatus[];
      events: AgentEvent[];
      obsidian?: boolean;
    } | null>(null),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (!enabled) {
      setState(null);
      return;
    }
    let active = true,
      inFlight = false;
    const controller = new AbortController();
    async function refresh() {
      if (inFlight) return;
      inFlight = true;
      try {
        const r = await fetch("/api/sync/agents", {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(5000),
          ]),
          cache: "no-store",
        });
        if (!r.ok) {
          if (active) setState(null);
          throw Error();
        }
        const body = await r.json();
        if (active) {
          setState(body);
          setMessage("");
        }
      } catch {
        if (active) setMessage("Activity connection unavailable.");
      } finally {
        inFlight = false;
      }
    }
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 1500);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
    };
  }, [enabled]);
  const nodes = [
    { id: "knowledge", name: "Knowledge", configured: true },
    { id: "obsidian", name: "Obsidian", configured: !!state?.obsidian },
    { id: "web", name: "Public research", configured: true },
    ...(state?.providers ?? []).map((p) => ({
      id: p.id,
      name: p.id === "local" ? "Ollama" : p.name,
      configured: p.configured,
    })),
  ];
  return (
    <section
      className="nexus-card nexus-live-network"
      aria-label="Nexus request activity"
    >
      <div className="eyebrow">NEXUS / ACTUAL REQUEST EVENTS</div>
      <h2>Connected work, visible.</h2>
      <p>
        Connections pulse for recorded requests, not simulated work. Configured
        providers are not guaranteed reachable. Public research and external
        sharing are opt-in.
      </p>
      {!enabled ? (
        <p>Pair as a Controller to view private request status.</p>
      ) : (
        <>
          <svg
            viewBox="0 0 700 310"
            role="img"
            aria-label="Nexus request globe and provider connections"
          >
            <defs>
              <radialGradient id="request-core">
                <stop stopColor="#195975" />
                <stop offset="1" stopColor="#061b2c" />
              </radialGradient>
            </defs>
            <circle
              cx="350"
              cy="150"
              r="71"
              fill="url(#request-core)"
              stroke="#41c2e7"
            />
            <ellipse
              cx="350"
              cy="150"
              rx="71"
              ry="25"
              fill="none"
              stroke="#5cc6df66"
            />
            <ellipse
              cx="350"
              cy="150"
              rx="29"
              ry="71"
              fill="none"
              stroke="#5cc6df66"
            />
            <text
              x="350"
              y="155"
              textAnchor="middle"
              fill="#bcf4ff"
              fontSize="15"
              letterSpacing="4"
            >
              NEXUS
            </text>
            {nodes.map((n, i) => {
              const angle = (i * Math.PI * 2) / nodes.length - Math.PI / 2,
                x = 350 + Math.cos(angle) * 244,
                y = 150 + Math.sin(angle) * 110,
                e = state?.events.find((e) => e.agent === n.id),
                recent = e && Date.now() - (e.finished ?? e.started) < 8000,
                working = e?.state === "working",
                cls = working
                  ? "is-working"
                  : recent && e?.state === "complete"
                    ? "is-complete"
                    : recent && e?.state === "failed"
                      ? "is-failed"
                      : "";
              return (
                <g key={n.id} className={cls}>
                  <path
                    d={`M${350 + Math.cos(angle) * 72} ${150 + Math.sin(angle) * 72} L${x} ${y}`}
                    fill="none"
                    stroke={n.configured ? "#2d7188" : "#293442"}
                    strokeWidth="1.5"
                    className="request-path"
                  />
                  <circle
                    cx={x}
                    cy={y}
                    r="8"
                    fill={n.configured ? "#68d5ef" : "#455364"}
                  />
                  <text
                    x={x}
                    y={y + 24}
                    textAnchor="middle"
                    fill="#b3d3e0"
                    fontSize="11"
                  >
                    {n.name}
                  </text>
                </g>
              );
            })}
          </svg>
          <p className="nexus-router-note">
            {message ||
              "Short requests may finish between refreshes; their completed paths remain highlighted briefly. Events expire after 15 minutes or server restart."}
          </p>
          <details>
            <summary>Recent request outcomes</summary>
            <ul>
              {state?.events.slice(0, 10).map((e) => (
                <li key={e.id}>
                  {e.agent} · {e.state} ·{" "}
                  {new Date(e.started).toLocaleTimeString()}
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
