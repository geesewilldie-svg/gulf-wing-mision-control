"use client";
import { useRef, useState } from "react";
import { Grip, Maximize2, Minimize2, Minus, Move } from "lucide-react";
export default function WorkspacePanel({
  title,
  subtitle,
  children,
  className = "",
  onMinimize,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  className?: string;
  onMinimize: () => void;
}) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const resize = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [max, setMax] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
    null,
  );
  return (
    <section
      className={`panel workspace-panel ${className} ${max ? "maximized" : ""}`}
      style={
        !max
          ? {
              transform: `translate(${offset.x}px, ${offset.y}px)`,
              ...(size ? { width: size.width, height: size.height } : {}),
            }
          : undefined
      }
      aria-label={title}
    >
      <header className="panel-heading">
        <div className="panel-title">
          <span className="tiny-square" />
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
        </div>
        <div className="window-controls">
          <button
            className="drag-control"
            aria-label={`Move ${title}`}
            title="Drag to move; arrow keys move 16px"
            onKeyDown={(e) => {
              const d: Record<string, [number, number]> = {
                ArrowLeft: [-16, 0],
                ArrowRight: [16, 0],
                ArrowUp: [0, -16],
                ArrowDown: [0, 16],
              };
              if (d[e.key]) {
                e.preventDefault();
                setOffset((v) => ({
                  x: Math.max(-160, Math.min(160, v.x + d[e.key][0])),
                  y: Math.max(-160, Math.min(160, v.y + d[e.key][1])),
                }));
              }
            }}
            onPointerDown={(e) => {
              if (max) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = {
                x: e.clientX,
                y: e.clientY,
                ox: offset.x,
                oy: offset.y,
              };
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (d)
                setOffset({
                  x: Math.max(-160, Math.min(160, d.ox + e.clientX - d.x)),
                  y: Math.max(-160, Math.min(160, d.oy + e.clientY - d.y)),
                });
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          >
            <Move size={13} />
          </button>
          <button aria-label={`Minimize ${title}`} onClick={onMinimize}>
            <Minus size={14} />
          </button>
          <button
            aria-label={`${max ? "Restore" : "Maximize"} ${title}`}
            onClick={() => setMax(!max)}
          >
            {max ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </header>
      <div className="panel-content">{children}</div>
      <button
        className="resize-hint"
        aria-label={`Resize ${title}`}
        title="Drag to resize; arrow keys adjust size"
        onKeyDown={(e) => {
          if (
            !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
          )
            return;
          e.preventDefault();
          const box = e.currentTarget.parentElement!.getBoundingClientRect();
          setSize({
            width: Math.max(
              280,
              box.width +
                (e.key === "ArrowRight" ? 16 : e.key === "ArrowLeft" ? -16 : 0),
            ),
            height: Math.max(
              220,
              box.height +
                (e.key === "ArrowDown" ? 16 : e.key === "ArrowUp" ? -16 : 0),
            ),
          });
        }}
        onPointerDown={(e) => {
          const box = e.currentTarget.parentElement!.getBoundingClientRect();
          resize.current = {
            x: e.clientX,
            y: e.clientY,
            width: box.width,
            height: box.height,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const r = resize.current;
          if (r)
            setSize({
              width: Math.max(280, r.width + e.clientX - r.x),
              height: Math.max(220, r.height + e.clientY - r.y),
            });
        }}
        onPointerUp={() => {
          resize.current = null;
        }}
        onPointerCancel={() => {
          resize.current = null;
        }}
      >
        <Grip size={13} />
      </button>
    </section>
  );
}
