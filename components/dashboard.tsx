"use client";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  Building2,
  ChevronRight,
  CircleDot,
  Command,
  Compass,
  Cpu,
  Layers,
  Menu,
  Network,
  Plane,
  Plus,
  Radio,
  RotateCcw,
  Shield,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";
import { agents, costs, initialTasks, Task, ventures } from "@/lib/demo";
import WorkspacePanel from "./workspace-panel";
export default function Dashboard() {
  const [venture, setVenture] = useState<string>(ventures[0]);
  const [selected, setSelected] = useState("GPT");
  const [tasks, setTasks] = useState(initialTasks);
  const [hidden, setHidden] = useState<string[]>([]);
  const [menu, setMenu] = useState(false);
  const [modal, setModal] = useState(false);
  const missionOpener = useRef<HTMLButtonElement | null>(null);
  const openMission = (opener: HTMLButtonElement) => {
    missionOpener.current = opener;
    setModal(true);
  };
  useEffect(() => {
    if (!modal && missionOpener.current) {
      missionOpener.current.focus({ preventScroll: true });
      missionOpener.current = null;
    }
  }, [modal]);
  const [title, setTitle] = useState("");
  const [agent, setAgent] = useState("GPT");
  const [events, setEvents] = useState([
    "Hermes completed operational workflow mapping",
    "Claude started quarterly performance analysis",
    "GPT prepared a portfolio briefing outline",
  ]);
  const [notice, setNotice] = useState("");
  const active = agents.find((a) => a.name === selected)!;
  const visibleTasks = tasks.filter((t) => t.venture === venture);
  const log = (message: string) => {
    setEvents((v) => [message, ...v].slice(0, 12));
    setNotice(message);
  };
  const addTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setTasks((v) => [
      ...v,
      { id: Date.now(), title: title.trim(), agent, status: "Queued", venture },
    ]);
    log(`${agent} received a demo task: ${title.trim()}`);
    setTitle("");
    setModal(false);
  };
  const advance = (task: Task) => {
    const next =
      task.status === "Queued"
        ? "In progress"
        : task.status === "In progress"
          ? "Complete"
          : "Queued";
    setTasks((v) =>
      v.map((t) => (t.id === task.id ? { ...t, status: next } : t)),
    );
    log(`${task.agent}: ${task.title} → ${next}`);
  };
  const icons = [Building2, Layers, Plane, Shield, Compass];
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? "mobile-open" : ""}`}>
        <a className="brand" href="#main">
          <span className="brand-mark">W</span>
          <span>
            GULF WING<small>MISSION CONTROL</small>
          </span>
        </a>
        <button
          className="mobile-close"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        >
          <X />
        </button>
        <div className="workspace-label">
          WORKSPACE <span>01</span>
        </div>
        <nav aria-label="Ventures">
          {ventures.map((v, i) => {
            const Icon = icons[i];
            return (
              <button
                key={v}
                className={v === venture ? "nav-item active" : "nav-item"}
                onClick={() => {
                  setVenture(v);
                  setMenu(false);
                }}
              >
                <Icon size={18} />
                <span>{v === ventures[0] ? "Holding Company" : v}</span>
                {v === venture && <ChevronRight size={14} />}
              </button>
            );
          })}
        </nav>
        <div className="side-divider" />
        <div className="workspace-label">COMMAND CENTER</div>
        <a className="nav-item active-secondary" href="#network">
          <Network size={18} /> Agent network <span className="count">4</span>
        </a>
        <a className="nav-item" href="#workspace">
          <Layers size={18} /> Workspace
        </a>
        <div className="sidebar-bottom">
          <div className="sandbox-card">
            <span className="status-dot" /> DEMO ENVIRONMENT
            <p>
              Your command center, in preview.
              <br />
              No live connections or charges.
            </p>
          </div>
          <div className="profile">
            <span className="avatar">GW</span>
            <div>
              Gulf Wing Operator<small>Local demo workspace</small>
            </div>
            <Command size={16} />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-toggle"
              aria-label="Open navigation"
              onClick={() => setMenu(true)}
            >
              <Menu size={20} />
            </button>
            <span className="muted">Workspace</span>
            <ChevronRight size={12} />
            <span>{venture}</span>
          </div>
          <div className="top-status">
            <span className="demo-tag">DEMO</span>
            <span className="connection">
              <span className="status-dot" /> Simulation online
            </span>
            <span className="operator">GW</span>
          </div>
        </header>
        <main id="main">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span /> GULF WING OPERATING SYSTEM{" "}
                <span className="version">/ PHASE 01</span>
              </div>
              <h1>
                Mission control<span>.</span>
              </h1>
              <p>
                One workspace. Every venture. A connected intelligence layer.
              </p>
            </div>
            <button
              className="primary-button"
              onClick={(e) => openMission(e.currentTarget)}
            >
              <Plus size={16} /> New mission
            </button>
          </div>
          <div className="metrics">
            <div>
              <span className="metric-icon">
                <Cpu size={18} />
              </span>
              <section>
                <small>AVAILABLE AGENTS</small>
                <strong>
                  04 <em>All simulated</em>
                </strong>
              </section>
              <span className="mini-bars">▂▄▃▆▅▇</span>
            </div>
            <div>
              <span className="metric-icon">
                <Layers size={18} />
              </span>
              <section>
                <small>OPEN MISSIONS</small>
                <strong>
                  {tasks
                    .filter((t) => t.status !== "Complete")
                    .length.toString()
                    .padStart(2, "0")}{" "}
                  <em>Across ventures</em>
                </strong>
              </section>
            </div>
            <div>
              <span className="metric-icon">
                <Activity size={18} />
              </span>
              <section>
                <small>DEMO COMPLETION</small>
                <strong>
                  {Math.round(
                    (tasks.filter((t) => t.status === "Complete").length /
                      tasks.length) *
                      100,
                  )}
                  <b>%</b> <em>Local task state</em>
                </strong>
              </section>
            </div>
            <div>
              <span className="metric-icon">
                <CircleDot size={18} />
              </span>
              <section>
                <small>SIMULATED SPEND</small>
                <strong>
                  $9.70 <em>No actual charges</em>
                </strong>
              </section>
            </div>
          </div>
          <section
            className="network-panel panel"
            id="network"
            aria-label="AI agent network"
          >
            <div className="network-heading">
              <div>
                <div className="eyebrow">INTELLIGENCE LAYER</div>
                <h2>Connected by design.</h2>
                <p>Select an agent to explore its role.</p>
              </div>
              <span className="network-pill">
                <Radio size={12} /> 4 DEMO NODES
              </span>
            </div>
            <div className="network-stage">
              <div className="orbit orbit-1" />
              <div className="orbit orbit-2" />
              <div className="orbit orbit-3" />
              <svg
                className="network-lines"
                viewBox="0 0 800 300"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path d="M400 150 L160 70 M400 150 L640 70 M400 150 L160 240 M400 150 L640 240" />
              </svg>
              <div className="core">
                <div className="core-logo">W</div>
                <strong>GULF WING</strong>
                <small>MISSION CORE</small>
              </div>
              {agents.map((a, i) => (
                <button
                  key={a.name}
                  className={`agent-node node-${i} ${selected === a.name ? "selected" : ""}`}
                  style={{ "--agent-color": a.color } as React.CSSProperties}
                  onClick={() => setSelected(a.name)}
                  aria-pressed={selected === a.name}
                >
                  <span className="agent-symbol">{a.symbol}</span>
                  <span>
                    <strong>{a.name}</strong>
                    <small>{a.role.split(" & ")[0]}</small>
                  </span>
                  <span className="node-dot" />
                </button>
              ))}
              <span className="coordinate coord-left">
                GW / NEURAL WORKSPACE
              </span>
              <span className="coordinate coord-right">SANDBOX · V.01</span>
            </div>
            <div className="agent-detail">
              <div>
                <span
                  className="status-dot"
                  style={{ background: active.color }}
                />
                <strong>{active.name}</strong>
                <span>{active.role}</span>
              </div>
              <button
                onClick={(e) => {
                  setAgent(selected);
                  openMission(e.currentTarget);
                }}
              >
                Assign demo mission <ArrowRight size={14} />
              </button>
            </div>
          </section>
          <div className="workspace-heading" id="workspace">
            <div>
              <h2>Your workspace</h2>
              <span>Move, resize, and make it yours.</span>
            </div>
            <button
              className="text-button"
              onClick={() => {
                setHidden([]);
                setNotice("All minimized panels restored");
              }}
            >
              <RotateCcw size={13} /> Restore panels
            </button>
          </div>
          <div className="workspace-grid">
            {!hidden.includes("Mission board") && (
              <WorkspacePanel
                title="Mission board"
                subtitle={`${venture} · DEMO`}
                className="task-panel"
                onMinimize={() => setHidden((v) => [...v, "Mission board"])}
              >
                <div className="board-top">
                  <span>{visibleTasks.length} missions</span>
                  <button
                    className="text-button"
                    onClick={(e) => openMission(e.currentTarget)}
                  >
                    <Plus size={13} /> Add task
                  </button>
                </div>
                <div className="kanban">
                  {(["Queued", "In progress", "Complete"] as const).map(
                    (status) => (
                      <div className="kanban-column" key={status}>
                        <h3>
                          <span
                            className={`status-marker ${status.replace(" ", "-")}`}
                          />
                          {status}
                          <small>
                            {
                              visibleTasks.filter((t) => t.status === status)
                                .length
                            }
                          </small>
                        </h3>
                        {visibleTasks
                          .filter((t) => t.status === status)
                          .map((t) => (
                            <article className="task-card" key={t.id}>
                              <span className="task-id">
                                GW-{String(t.id).slice(-3).padStart(3, "0")}
                              </span>
                              <h4>{t.title}</h4>
                              <div>
                                <span className="task-agent">{t.agent}</span>
                                <button
                                  aria-label={`Advance ${t.title}`}
                                  title="Move to next status"
                                  onClick={() => advance(t)}
                                >
                                  <ArrowRight size={14} />
                                </button>
                              </div>
                            </article>
                          ))}
                        {!visibleTasks.some((t) => t.status === status) && (
                          <div className="empty-column">No missions here</div>
                        )}
                      </div>
                    ),
                  )}
                </div>
              </WorkspacePanel>
            )}
            {!hidden.includes("Agent activity") && (
              <WorkspacePanel
                title="Agent activity"
                subtitle="Local simulation stream"
                className="activity-panel"
                onMinimize={() => setHidden((v) => [...v, "Agent activity"])}
              >
                <div className="feed">
                  {events.slice(0, 5).map((event, i) => (
                    <div className="feed-item" key={`${event}-${i}`}>
                      <span className="feed-icon">
                        <Terminal size={13} />
                      </span>
                      <div>
                        <p>{event}</p>
                        <small>
                          {i === 0 ? "Just now" : "Demo event"}{" "}
                          <span>· DEMO</span>
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  className="feed-action"
                  onClick={() =>
                    log(`${selected} generated a simulated status report`)
                  }
                >
                  <Sparkles size={13} /> Simulate agent event{" "}
                  <ArrowRight size={13} />
                </button>
              </WorkspacePanel>
            )}
            {!hidden.includes("Model costs") && (
              <WorkspacePanel
                title="Model costs"
                subtitle="Illustrative session · USD · DEMO"
                className="cost-panel"
                onMinimize={() => setHidden((v) => [...v, "Model costs"])}
              >
                <div className="cost-summary">
                  <div>
                    <small>SIMULATED TOTAL</small>
                    <strong>$9.70</strong>
                  </div>
                  <span>
                    <ArrowDownLeft size={13} /> No billing connected
                  </span>
                </div>
                <div className="cost-bar">
                  {costs.map((c, i) => (
                    <span
                      key={c.name}
                      style={{
                        width: `${(c.amount / 9.7) * 100}%`,
                        background: agents[i].color,
                      }}
                    />
                  ))}
                </div>
                <div className="cost-table">
                  {costs.map((c, i) => (
                    <div key={c.name}>
                      <span>
                        <i style={{ background: agents[i].color }} />
                        {c.name}
                      </span>
                      <small>{c.tokens} tokens</small>
                      <strong>${c.amount.toFixed(2)}</strong>
                    </div>
                  ))}
                </div>
              </WorkspacePanel>
            )}
          </div>
          {hidden.length > 0 && (
            <div className="panel-dock" aria-label="Minimized panels">
              {hidden.map((name) => (
                <button
                  key={name}
                  onClick={() => setHidden((v) => v.filter((n) => n !== name))}
                >
                  <Layers size={14} />
                  {name}
                  <Plus size={13} />
                </button>
              ))}
            </div>
          )}
          <footer>
            <span>
              <Shield size={12} /> DEMO DATA ONLY · NO LIVE INTEGRATIONS
            </span>
            <span>
              Built for the next horizon <span className="cyan">↗</span>
            </span>
          </footer>
          <span className="sr-only" role="status">
            {notice}
          </span>
        </main>
      </div>
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setModal(false);
            if (e.key === "Tab") {
              const controls = e.currentTarget.querySelectorAll<HTMLElement>(
                "button,input,select",
              );
              const first = controls[0];
              const last = controls[controls.length - 1];
              if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
              } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
              }
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="mission-title"
            className="mission-modal"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">LOCAL SIMULATION</span>
                <h2 id="mission-title">Create a mission</h2>
              </div>
              <button
                aria-label="Close mission dialog"
                onClick={() => setModal(false)}
              >
                <X size={20} />
              </button>
            </div>
            <p>This task stays in this session. No agent or API will run.</p>
            <form onSubmit={addTask}>
              <label>
                Mission title
                <input
                  autoFocus
                  required
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What needs to happen?"
                />
              </label>
              <label>
                Demo agent
                <select
                  value={agent}
                  onChange={(e) => setAgent(e.target.value)}
                >
                  {agents.map((a) => (
                    <option key={a.name}>{a.name}</option>
                  ))}
                </select>
              </label>
              <div className="modal-venture">Workspace: {venture}</div>
              <button className="primary-button" type="submit">
                <Plus size={15} /> Create demo mission
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
