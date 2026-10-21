"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Pause, Play, RotateCcw, ScanLine } from "lucide-react";
import { agents } from "@/lib/demo";

type Mode = "Core" | "Galaxy" | "Graph";
type Point = { x: number; y: number; z: number; group: number };
const TAU = Math.PI * 2;
const colors = ["#52dbff", "#bba5ff", "#64efcf", "#ffc48d"];

// Deterministic geometry makes the demo reproducible without external images or services.
function createPoints(mode: Mode): Point[] {
  const count = mode === "Graph" ? 105 : 1050;
  return Array.from({ length: count }, (_, i) => {
    const u = (i + 0.5) / count;
    const theta = i * 2.3999632297;
    const seed = Math.sin(i * 127.1 + 31.7) * 43758.5453;
    const noise = seed - Math.floor(seed);
    const group = i % 4;
    if (mode === "Galaxy") {
      const radius = Math.sqrt(u) * 1.25;
      const angle = radius * 5.5 + ((i % 3) * TAU) / 3 + noise * 0.62;
      return {
        x: Math.cos(angle) * radius,
        y: (noise - 0.5) * 0.22,
        z: Math.sin(angle) * radius,
        group,
      };
    }
    const y = 1 - 2 * u;
    const radius = Math.sqrt(1 - y * y);
    const shell = mode === "Graph" ? 0.45 + noise * 0.6 : 0.8 + noise * 0.18;
    return {
      x: Math.cos(theta) * radius * shell,
      y: y * shell,
      z: Math.sin(theta) * radius * shell,
      group,
    };
  });
}

export default function HolographicCore({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (name: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const rotation = useRef({ x: -0.15, y: 0 });
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const [mode, setMode] = useState<Mode>("Core");
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const expandButton = useRef<HTMLButtonElement>(null);
  const previousExpanded = useRef(false);
  useEffect(() => {
    if (previousExpanded.current !== expanded)
      expandButton.current?.focus({ preventScroll: true });
    previousExpanded.current = expanded;
  }, [expanded]);
  const [renderError, setRenderError] = useState(false);
  const [revision, setRevision] = useState(0);
  const activeColor =
    agents.find((a) => a.name === selected)?.color ?? colors[0];

  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    const app = document.querySelector<HTMLElement>(".app-shell");
    const previousInert = app?.inert ?? false;
    const previousOverflow = document.body.style.overflow;
    if (app) app.inert = true;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", close);
    return () => {
      if (app) app.inert = previousInert;
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", close);
    };
  }, [expanded]);

  useEffect(() => {
    const element = canvas.current;
    const container = stage.current;
    if (!element || !container) return;
    const ctx = element.getContext("2d");
    if (!ctx) {
      setRenderError(true);
      return;
    }
    const points = createPoints(mode);
    let width = 0,
      height = 0,
      frame = 0,
      last = 0,
      time = 0;
    let visible = !document.hidden;
    const draw = () => {
      const scale = Math.min(width * 0.31, height * 0.32);
      const cx = width / 2,
        cy = height / 2;
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.strokeStyle = "#28506b";
      ctx.lineWidth = 0.65;
      // HUD range rings and calibrated tick marks.
      for (const radius of [1.12, 1.31, 1.52]) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, scale * radius, scale * radius * 0.87, 0, 0, TAU);
        ctx.stroke();
      }
      for (let i = 0; i < 80; i++) {
        const angle = (i / 80) * TAU;
        const radius = scale * 1.52;
        const length = i % 5 === 0 ? 7 : 3;
        ctx.strokeStyle = i % 5 === 0 ? "#5c9bb3" : "#264759";
        ctx.beginPath();
        ctx.moveTo(
          cx + Math.cos(angle) * radius,
          cy + Math.sin(angle) * radius * 0.87,
        );
        ctx.lineTo(
          cx + Math.cos(angle) * (radius + length),
          cy + Math.sin(angle) * (radius + length) * 0.87,
        );
        ctx.stroke();
      }
      const angleY = rotation.current.y + time * 0.13;
      const angleX = rotation.current.x + (mode === "Galaxy" ? -0.7 : 0);
      const projected = points
        .map((point, i) => {
          const x = point.x * Math.cos(angleY) - point.z * Math.sin(angleY);
          const z = point.x * Math.sin(angleY) + point.z * Math.cos(angleY);
          const y = point.y * Math.cos(angleX) - z * Math.sin(angleX);
          const depth = point.y * Math.sin(angleX) + z * Math.cos(angleX);
          const breathe = 1 + Math.sin(time * 0.7 + i * 0.012) * 0.022;
          const perspective = 3.2 / (3.2 - depth);
          return {
            x: cx + x * scale * perspective * breathe,
            y: cy + y * scale * perspective * breathe,
            depth,
            group: point.group,
          };
        })
        .sort((a, b) => a.depth - b.depth);
      if (mode === "Graph") {
        for (let i = 0; i < projected.length; i++)
          for (let j = i + 1; j < projected.length; j++) {
            const a = projected[i],
              b = projected[j];
            const distance = Math.hypot(a.x - b.x, a.y - b.y);
            if (distance < scale * 0.34) {
              ctx.globalAlpha = (1 - distance / (scale * 0.34)) * 0.28;
              ctx.strokeStyle = colors[a.group];
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
          }
      }
      for (const point of projected) {
        ctx.globalAlpha = Math.max(0.14, (point.depth + 1.5) / 2.6);
        ctx.fillStyle = mode === "Core" ? activeColor : colors[point.group];
        const radius =
          mode === "Graph"
            ? 2.5 + (point.depth + 1) * 1.3
            : 0.6 + (point.depth + 1) * 0.5;
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, TAU);
        ctx.fill();
        if (mode !== "Core" && point.depth > 0.4) {
          ctx.globalAlpha *= 0.12;
          ctx.beginPath();
          ctx.arc(point.x, point.y, radius * 3, 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = activeColor;
      const scanY = cy + Math.sin(time * 0.4) * scale * 0.7;
      ctx.beginPath();
      ctx.moveTo(cx - scale * 1.5, scanY);
      ctx.lineTo(cx + scale * 1.5, scanY);
      ctx.stroke();
      ctx.restore();
    };
    const resize = () => {
      width = container.clientWidth;
      height = container.clientHeight;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw();
    };
    const tick = (now: number) => {
      if (visible && now - last > 32) {
        if (!paused && !reduced) time += Math.min((now - last) / 1000, 0.05);
        draw();
        last = now;
      }
      if (!paused && !reduced) frame = requestAnimationFrame(tick);
    };
    const visibility = () => {
      visible = !document.hidden;
      last = performance.now();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    document.addEventListener("visibilitychange", visibility);
    if (!paused && !reduced) frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [mode, paused, reduced, selected, activeColor, expanded, revision]);

  const content = (
    <div
      className={`holo-view ${expanded ? "holo-expanded" : ""}`}
      role={expanded ? "dialog" : undefined}
      aria-modal={expanded ? true : undefined}
      aria-label={expanded ? "Expanded agent hologram" : undefined}
      onKeyDown={(e) => {
        if (!expanded || e.key !== "Tab") return;
        const controls = e.currentTarget.querySelectorAll<HTMLElement>(
          "button,canvas[tabindex]",
        );
        const first = controls[0],
          last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }}
    >
      <div className="holo-toolbar">
        <div className="view-tabs" role="group" aria-label="Hologram view">
          {(["Core", "Galaxy", "Graph"] as const).map((view) => (
            <button
              key={view}
              aria-pressed={mode === view}
              onClick={() => setMode(view)}
            >
              {view}
            </button>
          ))}
        </div>
        <div className="holo-tools">
          <button
            aria-label={
              paused ? "Resume hologram motion" : "Pause hologram motion"
            }
            aria-pressed={paused}
            onClick={() => setPaused(!paused)}
          >
            {paused ? <Play size={13} /> : <Pause size={13} />}
          </button>
          <button
            aria-label="Reset hologram view"
            onClick={() => {
              rotation.current = { x: -0.15, y: 0 };
              setRevision((v) => v + 1);
            }}
          >
            <RotateCcw size={13} />
          </button>
          <button
            ref={expandButton}
            aria-label={expanded ? "Collapse hologram" : "Expand hologram"}
            aria-pressed={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>
      <div ref={stage} className="holo-stage">
        <canvas
          ref={canvas}
          aria-label={`${mode} hologram. Drag or use arrow keys to rotate the demo visualization.`}
          role="img"
          tabIndex={0}
          onKeyDown={(e) => {
            if (
              !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                e.key,
              )
            )
              return;
            e.preventDefault();
            rotation.current.y +=
              e.key === "ArrowRight" ? 0.15 : e.key === "ArrowLeft" ? -0.15 : 0;
            rotation.current.x +=
              e.key === "ArrowDown" ? 0.15 : e.key === "ArrowUp" ? -0.15 : 0;
            setRevision((v) => v + 1);
          }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            pointer.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerMove={(e) => {
            if (!pointer.current) return;
            rotation.current.y += (e.clientX - pointer.current.x) * 0.006;
            rotation.current.x += (e.clientY - pointer.current.y) * 0.006;
            pointer.current = { x: e.clientX, y: e.clientY };
            if (paused || reduced) setRevision((v) => v + 1);
          }}
          onPointerUp={() => {
            pointer.current = null;
          }}
          onPointerCancel={() => {
            pointer.current = null;
          }}
        />
        <div className="holo-caption">
          <ScanLine size={12} />
          <span>GW / NEURAL ENGINE</span>
          <span>
            {reduced
              ? "REDUCED MOTION"
              : paused
                ? "MOTION PAUSED"
                : "SIMULATION ACTIVE"}
          </span>
        </div>
        {renderError && (
          <p className="holo-fallback">
            Visualization unavailable. Select any agent below to continue.
          </p>
        )}
        <div className="holo-center-label">
          <small>GULF WING</small>
          <strong>
            {mode === "Core"
              ? "N E X U S"
              : mode === "Galaxy"
                ? "M E M O R Y"
                : "N E T W O R K"}
          </strong>
          <span>
            {mode === "Core"
              ? "COGNITIVE CORE"
              : mode === "Galaxy"
                ? "DEMO KNOWLEDGE FIELD"
                : "DEMO RELATIONSHIP MAP"}
          </span>
        </div>
        <div
          className="holo-nodes"
          role="group"
          aria-label="Agent constellation"
        >
          {agents.map((agent, i) => (
            <button
              key={agent.name}
              className={`holo-node holo-node-${i} ${selected === agent.name ? "is-selected" : ""}`}
              style={{ "--node-color": agent.color } as React.CSSProperties}
              aria-label={`${agent.name} ${agent.role.split(" & ")[0]}`}
              aria-pressed={selected === agent.name}
              onClick={() => onSelect(agent.name)}
            >
              <span className="node-light" />
              <span className="node-label">
                <strong>{agent.name}</strong>
                <small>{agent.role.split(" & ")[0]}</small>
              </span>
            </button>
          ))}
        </div>
        <div className="holo-readout left">
          VECTOR / 04
          <br />
          <span>LOCAL DEMO</span>
        </div>
        <div className="holo-readout right">
          {mode.toUpperCase()} VIEW
          <br />
          <span>DRAG TO ROTATE</span>
        </div>
      </div>
      <div className="holo-bottom">
        <span>04 AGENT NODES</span>
        <span>NO LIVE CONNECTIONS</span>
        <span>GW—01</span>
      </div>
    </div>
  );
  return expanded ? createPortal(content, document.body) : content;
}
