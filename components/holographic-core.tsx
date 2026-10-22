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
  const count = 1050;
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
    const shell = 0.8 + noise * 0.18;
    return {
      x: Math.cos(theta) * radius * shell,
      y: y * shell,
      z: Math.sin(theta) * radius * shell,
      group,
    };
  });
}

// Original procedural surface: illustrative signal heights, never provider telemetry.
function drawTerrain(
  ctx: CanvasRenderingContext2D, width: number, height: number,
  rotation: { x: number; y: number }, time: number, selected: string,
) {
  const size = 40;
  const scale = Math.min(width * 0.27, height * 0.36);
  const yaw = rotation.y + 0.55;
  const tilt = Math.max(0.25, Math.min(1.15, 0.58 + rotation.x));
  const peaks = [ [-0.65, -0.5], [0.55, -0.5], [-0.5, 0.65], [0.65, 0.55] ];
  const selectedIndex = agents.findIndex((agent) => agent.name === selected);
  const heightAt = (x: number, z: number) => {
    let value = 0.025 + 0.018 * Math.sin(x * 14 + time) * Math.cos(z * 12);
    peaks.forEach(([px, pz], index) => {
      const distance = (x - px) ** 2 + (z - pz) ** 2;
      value += Math.exp(-distance * 11) * (index === selectedIndex ? 0.95 : 0.57);
    });
    return value;
  };
  const project = (x: number, y: number, z: number) => {
    const rx = x * Math.cos(yaw) - z * Math.sin(yaw);
    const rz = x * Math.sin(yaw) + z * Math.cos(yaw);
    return {
      x: width / 2 + rx * scale,
      y: height * 0.57 + (rz * Math.sin(tilt) - y * Math.cos(tilt)) * scale,
      depth: rz * Math.cos(tilt) + y * Math.sin(tilt),
    };
  };
  const color = (height: number, alpha: number) =>
    `hsla(${190 - Math.min(height / 0.95, 1) * 182}, 95%, 65%, ${alpha})`;
  ctx.save();
  // Floor grid and drop lines establish depth, distinct from the orbital views.
  ctx.strokeStyle = "#174359";
  ctx.lineWidth = 0.6;
  const line = (a: ReturnType<typeof project>, b: ReturnType<typeof project>) => {
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  };
  for (let i = 0; i <= 12; i++) {
    const n = -1.35 + i * 2.7 / 12;
    line(project(n, -0.12, -1.35), project(n, -0.12, 1.35));
    line(project(-1.35, -0.12, n), project(1.35, -0.12, n));
  }
  const grid = Array.from({ length: size + 1 }, (_, row) =>
    Array.from({ length: size + 1 }, (_, col) => {
      const x = -1.2 + col * 2.4 / size, z = -1.2 + row * 2.4 / size;
      const h = heightAt(x, z);
      return { ...project(x, h, z), h };
    }),
  );
  const cells = [];
  for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) {
    const corners = [grid[row][col], grid[row][col + 1], grid[row + 1][col + 1], grid[row + 1][col]];
    cells.push({ corners, depth: corners.reduce((sum, point) => sum + point.depth, 0) / 4 });
  }
  cells.sort((a, b) => a.depth - b.depth);
  ctx.lineWidth = 0.75;
  for (const { corners } of cells) {
    const h = corners.reduce((sum, point) => sum + point.h, 0) / 4;
    ctx.beginPath();
    corners.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.closePath();
    ctx.fillStyle = "rgba(3, 15, 30, 0.8)"; ctx.fill();
    ctx.fillStyle = color(h, 0.12); ctx.fill();
    ctx.strokeStyle = color(h, 0.65); ctx.stroke();
  }
  const sweep = Math.sin(time * 0.65) * 1.15;
  ctx.strokeStyle = "#a6f7ff";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let col = 0; col <= size; col++) {
    const x = -1.2 + col * 2.4 / size;
    const p = project(x, heightAt(x, sweep) + 0.008, sweep);
    if (col === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  peaks.forEach(([x, z], index) => {
    const top = project(x, heightAt(x, z), z);
    ctx.strokeStyle = color(heightAt(x, z), 0.45);
    line(project(x, -0.12, z), top);
    ctx.fillStyle = index === selectedIndex ? "#fff3c4" : "#83e9ff";
    ctx.beginPath(); ctx.arc(top.x, top.y, index === selectedIndex ? 4 : 2.5, 0, TAU); ctx.fill();
    ctx.font = "10px monospace";
    ctx.fillText(agents[index].name.toUpperCase(), top.x + 8, top.y - 8);
  });
  ctx.restore();
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
      if (mode === "Graph") {
        drawTerrain(ctx, width, height, rotation.current, time, selected);
        return;
      }
      ctx.save();
      ctx.strokeStyle = "#28506b";
      ctx.lineWidth = 0.65;
      // HUD range rings and calibrated tick marks.
      for (const radius of [1.12, 1.31, 1.52]) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, scale * radius, scale * radius * 0.87, 0, 0, TAU);
        ctx.stroke();
      }
      // Independent radial scanner segments inspired by the supplied cinematic HUD references.
      ctx.save();
      ctx.strokeStyle = activeColor;
      for (let band = 0; band < 3; band++) {
        const radius = scale * (1.14 + band * 0.18);
        ctx.lineWidth = band === 1 ? 4 : 2;
        ctx.globalAlpha = band === 1 ? 0.65 : 0.35;
        for (let segment = 0; segment < 4; segment++) {
          const start =
            (segment * TAU) / 4 +
            time * (band % 2 ? -0.06 : 0.045) +
            band * 0.2;
          ctx.beginPath();
          ctx.ellipse(
            cx,
            cy,
            radius,
            radius * 0.87,
            0,
            start,
            start + 0.55 + band * 0.16,
          );
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 0.7;
      for (let quadrant = 0; quadrant < 4; quadrant++) {
        const angle = (quadrant * TAU) / 4 + Math.PI / 4;
        const inner = scale * 1.1,
          outer = scale * 1.63;
        ctx.beginPath();
        ctx.moveTo(
          cx + Math.cos(angle) * inner,
          cy + Math.sin(angle) * inner * 0.87,
        );
        ctx.lineTo(
          cx + Math.cos(angle) * outer,
          cy + Math.sin(angle) * outer * 0.87,
        );
        ctx.stroke();
      }
      ctx.restore();
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
      for (const point of projected) {
        ctx.globalAlpha = Math.max(0.14, (point.depth + 1.5) / 2.6);
        ctx.fillStyle = mode === "Core" ? activeColor : colors[point.group];
        const radius =
          0.6 + (point.depth + 1) * 0.5;
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
      <div ref={stage} className={`holo-stage ${mode === "Graph" ? "terrain-stage" : ""}`}>
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
        {mode === "Graph" && (
          <div className="terrain-legend" aria-label="Demo terrain height scale">
            <span>LOW</span><span>DEMO SIGNAL HEIGHT</span><span>HIGH</span>
          </div>
        )}
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
                : "S I G N A L"}
          </strong>
          <span>
            {mode === "Core"
              ? "COGNITIVE CORE"
              : mode === "Galaxy"
                ? "DEMO KNOWLEDGE FIELD"
                : "DEMO SIGNAL TERRAIN"}
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
