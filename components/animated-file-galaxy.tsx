"use client";
import { useEffect, useRef, useState } from "react";
export type GalaxyFile = {
  id: string;
  hash: string;
  name: string;
  folder: string;
  rootId: string;
  noteLinks?: { links: { id: string }[] } | null;
};
const TAU = Math.PI * 2,
  colors = ["#52dbff", "#bba5ff", "#64efcf", "#ffc48d"];
// Same three-arm geometry and palette as the original Mission Control Galaxy.
const stars = Array.from({ length: 1050 }, (_, i) => {
  const u = (i + 0.5) / 1050,
    seed = Math.sin(i * 127.1 + 31.7) * 43758.5453,
    noise = seed - Math.floor(seed);
  const radius = Math.sqrt(u) * 1.25,
    angle = radius * 5.5 + ((i % 3) * TAU) / 3 + noise * 0.62;
  return {
    x: Math.cos(angle) * radius,
    y: (noise - 0.5) * 0.22,
    z: Math.sin(angle) * radius,
    group: i % 4,
  };
});
export default function AnimatedFileGalaxy({
  files,
  selectedId,
  zoom,
  onRead,
}: {
  files: GalaxyFile[];
  selectedId?: string;
  zoom: number;
  onRead: (file: GalaxyFile) => void;
}) {
  const stage = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    buttons = useRef(new Map<string, HTMLButtonElement>());
  const rotation = useRef({ x: -0.85, y: 0 }),
    time = useRef(0),
    drag = useRef<{ x: number; y: number } | null>(null);
  const [paused, setPaused] = useState(false),
    [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const element = canvas.current,
      container = stage.current;
    if (!element || !container) return;
    const ctx = element.getContext("2d");
    if (!ctx) return;
    let width = 0,
      height = 0,
      frame = 0,
      last = 0;
    const groups = [...new Set(files.map((file) => file.rootId))];
    const draw = () => {
      const cx = width / 2,
        cy = height / 2,
        scale = Math.min(width * 0.29, height * 0.34) * zoom;
      ctx.clearRect(0, 0, width, height);
      const yaw = rotation.current.y + time.current * 0.13,
        tilt = rotation.current.x;
      const project = (point: { x: number; y: number; z: number }) => {
        const x = point.x * Math.cos(yaw) - point.z * Math.sin(yaw),
          z = point.x * Math.sin(yaw) + point.z * Math.cos(yaw),
          y = point.y * Math.cos(tilt) - z * Math.sin(tilt),
          depth = point.y * Math.sin(tilt) + z * Math.cos(tilt),
          perspective = 3.2 / (3.2 - depth);
        return {
          x: cx + x * scale * perspective,
          y: cy + y * scale * perspective,
          depth,
        };
      };
      ctx.lineWidth = 0.65;
      ctx.strokeStyle = "#28506b";
      for (const r of [1.12, 1.31, 1.52]) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, scale * r, scale * r * 0.87, 0, 0, TAU);
        ctx.stroke();
      }
      for (let band = 0; band < 3; band++) {
        ctx.strokeStyle = colors[band];
        ctx.lineWidth = band === 1 ? 3 : 1.5;
        ctx.globalAlpha = band === 1 ? 0.5 : 0.3;
        for (let segment = 0; segment < 4; segment++) {
          const start =
            (segment * TAU) / 4 +
            time.current * (band % 2 ? -0.06 : 0.045) +
            band * 0.2;
          ctx.beginPath();
          ctx.ellipse(
            cx,
            cy,
            scale * (1.14 + band * 0.18),
            scale * (1.14 + band * 0.18) * 0.87,
            0,
            start,
            start + 0.55 + band * 0.16,
          );
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      ctx.lineWidth = 0.7;
      for (let i = 0; i < 80; i++) {
        const a = (i / 80) * TAU,
          r = scale * 1.52,
          len = i % 5 === 0 ? 7 : 3;
        ctx.strokeStyle = i % 5 === 0 ? "#5c9bb3" : "#264759";
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.87);
        ctx.lineTo(
          cx + Math.cos(a) * (r + len),
          cy + Math.sin(a) * (r + len) * 0.87,
        );
        ctx.stroke();
      }
      for (const point of stars
        .map((star, i) => ({
          ...project(star),
          group: star.group,
          breathe: 1 + Math.sin(time.current * 0.7 + i * 0.012) * 0.022,
        }))
        .sort((a, b) => a.depth - b.depth)) {
        ctx.globalAlpha = Math.max(0.14, (point.depth + 1.5) / 2.6);
        ctx.fillStyle = colors[point.group];
        const r = 0.6 + (point.depth + 1) * 0.5;
        const x = cx + (point.x - cx) * point.breathe,
          y = cy + (point.y - cy) * point.breathe;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
        if (point.depth > 0.4) {
          ctx.globalAlpha *= 0.12;
          ctx.beginPath();
          ctx.arc(x, y, r * 3, 0, TAU);
          ctx.fill();
        }
      }
      const positions = files.map((file, i) => {
        const r =
            0.58 + Math.sqrt((i + 0.5) / Math.max(files.length, 1)) * 0.48,
          a = i * 2.3999632297 + 0.8;
        return {
          file,
          ...project({ x: Math.cos(a) * r, y: 0, z: Math.sin(a) * r }),
        };
      });
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = "#76e8ff";
      ctx.lineWidth = 1;
      for (const point of positions)
        for (const link of point.file.noteLinks?.links || []) {
          const target = positions.find((other) => other.file.id === link.id);
          if (target) {
            ctx.beginPath();
            ctx.moveTo(point.x, point.y);
            ctx.lineTo(target.x, target.y);
            ctx.stroke();
          }
        }
      ctx.globalAlpha = 0.18;
      ctx.lineWidth = 0.6;
      for (const root of groups) {
        const members = positions.filter((point) => point.file.rootId === root);
        for (let i = 1; i < members.length; i++) {
          ctx.beginPath();
          ctx.moveTo(members[0].x, members[0].y);
          ctx.lineTo(members[i].x, members[i].y);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      for (const point of positions) {
        const button = buttons.current.get(point.file.id);
        if (button) {
          button.style.left = `${point.x}px`;
          button.style.top = `${point.y}px`;
          button.style.setProperty(
            "--file-glow",
            colors[groups.indexOf(point.file.rootId) % colors.length],
          );
        }
      }
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
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    const tick = (now: number) => {
      if (!document.hidden && now - last > 32) {
        if (last) time.current += Math.min((now - last) / 1000, 0.05);
        last = now;
        draw();
      }
      frame = requestAnimationFrame(tick);
    };
    const rotate = (event: PointerEvent) => {
      if (!drag.current) return;
      rotation.current.y += (event.clientX - drag.current.x) * 0.007;
      rotation.current.x = Math.max(
        -1.35,
        Math.min(
          -0.2,
          rotation.current.x + (event.clientY - drag.current.y) * 0.005,
        ),
      );
      drag.current = { x: event.clientX, y: event.clientY };
      draw();
    };
    container.addEventListener("pointermove", rotate);
    if (!paused && !reduced && !selectedId) frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      container.removeEventListener("pointermove", rotate);
    };
  }, [files, zoom, paused, reduced, selectedId]);
  return (
    <div className="memory-spiral-shell">
      <div className="memory-spiral-controls">
        <span>MEMORY / FILE CONSTELLATION</span>
        <button onClick={() => setPaused((value) => !value)}>
          {paused ? "Resume galaxy" : "Pause galaxy"}
        </button>
        <button
          onClick={() => {
            rotation.current = { x: -0.85, y: 0 };
            time.current = 0;
            setPaused(true);
          }}
        >
          Reset rotation
        </button>
      </div>
      <div
        className="memory-spiral-stage"
        ref={stage}
        onPointerDown={(event) => {
          if (event.target !== canvas.current) return;
          drag.current = { x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <canvas
          ref={canvas}
          role="img"
          aria-label="Original animated spiral galaxy style with selectable file stars"
        />
        <div className="memory-spiral-label" aria-hidden="true">
          <small>GULF WING</small>
          <strong>M E M O R Y</strong>
          <span>{reduced ? "REDUCED MOTION" : "FILE CONSTELLATION"}</span>
        </div>
        {files.map((file) => (
          <button
            key={file.id}
            ref={(element) => {
              if (element) buttons.current.set(file.id, element);
              else buttons.current.delete(file.id);
            }}
            className={`memory-file-star ${selectedId === file.id ? "is-selected" : ""}`}
            aria-label={`Read indexed file: ${file.folder} / ${file.name}`}
            title={`${file.folder} / ${file.name}`}
            onPointerEnter={() => setPaused(true)}
            onFocus={() => setPaused(true)}
            onClick={() => onRead(file)}
          >
            <i aria-hidden="true" />
            <span>{file.name}</span>
          </button>
        ))}
      </div>
      <p className="memory-spiral-key">
        Bright labelled stars open files. The faint star field preserves the
        original galaxy appearance and is decorative. Drag the background to
        rotate.
      </p>
    </div>
  );
}
