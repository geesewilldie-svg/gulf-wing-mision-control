"use client";
import { useEffect, useState } from "react";
import { ArrowLeft, Maximize2, Minimize2, Monitor, Shield } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  displayViews,
  parseDisplayView,
  type DisplayView,
} from "@/lib/displays";
import { agents } from "@/lib/demo";
import HolographicCore from "./holographic-core";

export default function Presentation() {
  const { workspace, ready, storageMessage } = useWorkspace({ readOnly: true });
  const [view, setView] = useState<DisplayView>("overview");
  const [selected, setSelected] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    setView(parseDisplayView(new URLSearchParams(location.search).get("view")));
    const change = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);
  const toggleFullscreen = async () => {
    setMessage("");
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen)
        await document.documentElement.requestFullscreen();
      else
        setMessage(
          "Fullscreen is unavailable here. Use your browser or device’s screen-mirroring controls.",
        );
    } catch {
      setMessage(
        "Fullscreen could not start. You can still move or mirror this window using your device controls.",
      );
    }
  };
  if (!ready)
    return (
      <main className="loading-workspace" role="status">
        Loading display…
      </main>
    );
  const tasks = workspace.tasks.filter(
    (task) => task.venture === workspace.venture,
  );
  const active = agents.find(
    (agent) => agent.name === (selected ?? workspace.selected),
  )!;
  const completed = tasks.filter((task) => task.status === "Complete").length;
  const showCore = view === "overview" || view === "core";
  const showMissions = view === "overview" || view === "missions";
  const showActivity = view === "overview" || view === "activity";
  return (
    <main className={`presentation presentation-${view}`}>
      <header className="display-header">
        <a href="/" className="display-back">
          <ArrowLeft size={15} /> Command center
        </a>
        <span>
          <Monitor size={14} />{" "}
          {displayViews.find((item) => item.id === view)?.name}
        </span>
        <button onClick={toggleFullscreen}>
          {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}{" "}
          {fullscreen ? "Exit fullscreen" : "Fullscreen"}
        </button>
      </header>
      <div className="display-title">
        <div>
          <div className="eyebrow">GULF WING / PRESENTATION DISPLAY</div>
          <h1>
            {workspace.venture}
            <span>.</span>
          </h1>
          <p>DEMO · Saved workspace in this browser · No live integrations</p>
        </div>
        <div className="display-count">
          <strong>
            {completed.toString().padStart(2, "0")} /{" "}
            {tasks.length.toString().padStart(2, "0")}
          </strong>
          <span>MISSIONS COMPLETE</span>
        </div>
      </div>
      {storageMessage && (
        <p className="storage-warning" role="alert">
          {storageMessage}
        </p>
      )}
      <div className="display-grid">
        {showCore && (
          <section
            className="panel display-core"
            aria-label="Presentation agent network"
          >
            <div className="display-panel-title">
              <span>NEURAL ENGINE</span>
              <strong>
                {active.name} <small>{active.role}</small>
              </strong>
            </div>
            <HolographicCore selected={active.name} onSelect={setSelected} />
          </section>
        )}
        {showMissions && (
          <section
            className="panel display-missions"
            aria-label="Presentation missions"
          >
            <div className="display-panel-title">
              <span>MISSION QUEUE</span>
              <strong>
                {tasks.length} missions <small>Current venture</small>
              </strong>
            </div>
            <div className="display-board">
              {(["Queued", "In progress", "Complete"] as const).map(
                (status) => (
                  <div key={status}>
                    <h2>
                      {status}
                      <span>
                        {tasks.filter((task) => task.status === status).length}
                      </span>
                    </h2>
                    {tasks
                      .filter((task) => task.status === status)
                      .map((task) => (
                        <article key={task.id}>
                          <h3>{task.title}</h3>
                          <p>
                            {task.agent} <span>DEMO</span>
                          </p>
                        </article>
                      ))}
                    {!tasks.some((task) => task.status === status) && (
                      <p className="display-empty">No missions in this lane.</p>
                    )}
                  </div>
                ),
              )}
            </div>
          </section>
        )}
        {showActivity && (
          <section
            className="panel display-activity"
            aria-label="Presentation activity"
          >
            <div className="display-panel-title">
              <span>AGENT ACTIVITY</span>
              <strong>
                Local simulation <small>Latest 12 events</small>
              </strong>
            </div>
            <ol>
              {workspace.events.map((event, i) => (
                <li key={`${event}-${i}`}>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    {event}
                    <small>SIMULATED EVENT · DEMO</small>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
      <footer className="display-footer">
        <span>
          <Shield size={14} /> DEMO DISPLAY · NO LIVE CONNECTIONS
        </span>
        <span>Same-browser updates · Use device controls for TV mirroring</span>
      </footer>
      <p role="status" className="display-message">
        {message}
      </p>
    </main>
  );
}
