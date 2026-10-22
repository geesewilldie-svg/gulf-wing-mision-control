"use client";
import { useState } from "react";
import { ArrowLeft, Maximize2 } from "lucide-react";
import { agents, ventures, type Task } from "@/lib/demo";
import { useWorkspace } from "@/hooks/use-workspace";
import HolographicCore from "./holographic-core";
import SyncControls from "./sync-controls";

export default function ScreenPad() {
  const { workspace, setWorkspace, ready, storageMessage, sync } = useWorkspace();
  const [message, setMessage] = useState("");
  if (!ready) return <main role="status">Loading ScreenPad…</main>;
  const readOnly = sync.mode === "shared" && sync.role === "display";
  const tasks = workspace.tasks.filter((task) => task.venture === workspace.venture);
  const select = (name: string) => {
    if (!readOnly) setWorkspace((current) => ({ ...current, selected: name }));
  };
  const advance = (task: Task) => {
    if (readOnly) return;
    setWorkspace((current) => {
      const latest = current.tasks.find((item) => item.id === task.id);
      if (!latest) return current;
      const status = latest.status === "Queued" ? "In progress" : latest.status === "In progress" ? "Complete" : "Queued";
      return {
        ...current,
        tasks: current.tasks.map((item) => item.id === latest.id ? { ...item, status } : item),
        events: [`${latest.agent}: ${latest.title} → ${status} (ScreenPad DEMO)`, ...current.events].slice(0, 12),
      };
    });
  };
  return (
    <main className="screenpad-console">
      <header className="screenpad-header">
        <a href="/"><ArrowLeft size={14} /> Main dashboard</a>
        <strong>GW / SCREENPAD <span>DEMO</span></strong>
        <button onClick={async () => {
          try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else await document.documentElement.requestFullscreen();
          } catch { setMessage("Use F11 if browser fullscreen is unavailable."); }
        }}><Maximize2 size={14} /> Fullscreen</button>
      </header>
      <SyncControls />
      {storageMessage && <p role="alert">{storageMessage}</p>}
      {readOnly && <p role="status">Display-only session. Pair as a controller to edit missions.</p>}
      <div className="screenpad-layout">
        <section className="screenpad-visual" aria-label="ScreenPad intelligence">
          <HolographicCore selected={workspace.selected} onSelect={select} />
        </section>
        <section className="screenpad-actions" aria-label="ScreenPad mission controls">
          <label htmlFor="screenpad-venture">VENTURE</label>
          <select id="screenpad-venture" value={workspace.venture} disabled={readOnly}
            onChange={(event) => setWorkspace((current) => ({ ...current, venture: event.target.value }))}>
            {ventures.map((venture) => <option key={venture}>{venture}</option>)}
          </select>
          <div className="screenpad-agent-buttons" role="group" aria-label="ScreenPad agents">
            {agents.map((agent) => <button key={agent.name} disabled={readOnly}
              aria-pressed={workspace.selected === agent.name} onClick={() => select(agent.name)}>{agent.name}</button>)}
          </div>
          <h1>Mission quick controls</h1>
          <p className="screenpad-hint">Tap a mission to advance its demo status.</p>
          <div className="screenpad-queue">
            {tasks.map((task) => <button key={task.id} disabled={readOnly} onClick={() => advance(task)}
              aria-label={`Advance ${task.title}: ${task.status}`}>
              <strong>{task.title}</strong><span>{task.agent} · {task.status}</span>
            </button>)}
            {!tasks.length && <p>No missions for this venture.</p>}
          </div>
        </section>
      </div>
      <footer>DEMO · {sync.mode === "shared" ? sync.status : "Same-browser workspace"} · No live agent integrations</footer>
      <p role="status">{message}</p>
    </main>
  );
}
