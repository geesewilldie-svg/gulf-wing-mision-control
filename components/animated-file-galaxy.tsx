"use client";
import { galaxyCatalog, galaxyType, galaxyTypes } from "@/lib/galaxy-catalog";
import { galaxyNeighborhood } from "@/lib/galaxy-neighborhood";
import { useEffect, useRef, useState } from "react";
export type GalaxyFile = {
  id: string;
  hash: string;
  name: string;
  folder: string;
  rootId: string;
  resourceKind?: "drive" | "folder" | "file";
  resourceAvailable?: boolean;
  noteLinks?: { links: { id: string }[] } | null;
};
const TAU = Math.PI * 2,
  colors = ["#77dfff", "#c7a4ff", "#ffb3e1", "#e5d4ff"];
// Preserve the original three-arm geometry; lighting follows the owner reference.
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
  files: catalogFiles,
  selectedId,
  zoom,
  onRead,
  resourceMode = false,
  onFit,
}: {
  onFit?: () => void;
  resourceMode?: boolean;
  files: GalaxyFile[];
  selectedId?: string;
  zoom: number;
  onRead: (file: GalaxyFile) => void;
}) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [railOpen, setRailOpen] = useState(false);
  useEffect(() => {
    setRailOpen(!matchMedia("(max-width: 700px)").matches);
  }, []);
  const catalog = galaxyCatalog(catalogFiles, query, typeFilter, sourceFilter);
  const files = catalog.files;
  const stage = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    buttons = useRef(new Map<string, HTMLButtonElement>());
  const rotation = useRef({ x: -0.85, y: 0 }),
    time = useRef(0),
    drag = useRef<{ x: number; y: number } | null>(null);
  const [revision, setRevision] = useState(0);
  const [allNames, setAllNames] = useState(false);
  const [trail, setTrail] = useState<string[]>([]);
  const focusId = trail.at(-1);
  const neighborhood = galaxyNeighborhood(files, focusId);
  const focused = neighborhood.focus;
  const visible = neighborhood.visible;
  const focusZoom = useRef(1);
  const targetZoom = focused ? 1.65 : 1;
  function focusStar(file: GalaxyFile) {
    if (file.id === focused?.id) {
      onRead(file);
      return;
    }
    focusZoom.current = 1;
    setRailOpen(true);
    setPaused(true);
    setTrail((previous) => [...previous, file.id]);
  }
  useEffect(() => {
    if (focusId && !files.some((file) => file.id === focusId)) setTrail([]);
  }, [files, focusId]);
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
    const draw = () => {
      const cx = width / 2,
        cy = height / 2,
        scale =
          Math.min(width * 0.29, height * 0.34) * zoom * focusZoom.current;
      ctx.clearRect(0, 0, width, height);
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, scale * 1.3);
      glow.addColorStop(0, "#eadcff66");
      glow.addColorStop(0.13, "#b382e83c");
      glow.addColorStop(0.5, "#5e36991c");
      glow.addColorStop(1, "#110d2900");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);
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
      const progress = Math.max(0, Math.min(1, (focusZoom.current - 1) / 0.65));
      const positions = visible.map((file, i) => {
        const index = files.findIndex((candidate) => candidate.id === file.id);
        const r =
            0.58 + Math.sqrt((index + 0.5) / Math.max(files.length, 1)) * 0.48,
          a = index * 2.3999632297 + 0.8;
        const original = project({
          x: Math.cos(a) * r,
          y: 0,
          z: Math.sin(a) * r,
        });
        if (!focused) return { file, ...original };
        const neighborIndex = i - 1,
          angle =
            (neighborIndex * TAU) / Math.max(1, neighborhood.nearby.length) +
            0.4;
        const orbit = project({
          x: Math.cos(angle) * 0.72,
          y: 0,
          z: Math.sin(angle) * 0.72,
        });
        const target = file.id === focused.id ? { x: cx, y: cy } : orbit;
        return {
          file,
          x: original.x + (target.x - original.x) * progress,
          y: original.y + (target.y - original.y) * progress,
        };
      });
      // No connecting strokes: relationships are explored by focusing file stars.
      ctx.globalAlpha = 1;
      for (const point of positions) {
        const button = buttons.current.get(point.file.id);
        if (button) {
          button.style.left = `${point.x}px`;
          button.style.top = `${point.y}px`;
          button.style.setProperty(
            "--file-glow",
            galaxyTypes[galaxyType(point.file)].color,
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
      const settling = Math.abs(focusZoom.current - targetZoom) > 0.002;
      if (settling)
        focusZoom.current += (targetZoom - focusZoom.current) * 0.22;
      if (!document.hidden && now - last > 32) {
        if (last && !paused && !reduced && !selectedId)
          time.current += Math.min((now - last) / 1000, 0.05);
        last = now;
        draw();
      }
      if (
        (!paused && !reduced && !selectedId) ||
        Math.abs(focusZoom.current - targetZoom) > 0.002
      )
        frame = requestAnimationFrame(tick);
    };
    const rotate = (event: PointerEvent) => {
      if (!drag.current) return;
      rotation.current.y += (event.clientX - drag.current.x) * 0.007;
      rotation.current.x += (event.clientY - drag.current.y) * 0.005;
      drag.current = { x: event.clientX, y: event.clientY };
      draw();
    };
    container.addEventListener("pointermove", rotate);
    if (reduced) {
      focusZoom.current = targetZoom;
      draw();
    } else if (
      (!paused && !selectedId) ||
      Math.abs(focusZoom.current - targetZoom) > 0.002
    )
      frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      container.removeEventListener("pointermove", rotate);
    };
  }, [files, zoom, paused, reduced, selectedId, focusId, revision]);
  return (
    <div
      className={`memory-spiral-shell ${allNames ? "show-all-file-names" : ""}`}
    >
      <div className="memory-spiral-controls">
        <span>
          {resourceMode
            ? "STORAGE / RESOURCE CONSTELLATION"
            : "MEMORY / FILE CONSTELLATION"}
        </span>
        <button onClick={() => setPaused((value) => !value)}>
          {paused ? "Resume galaxy" : "Pause galaxy"}
        </button>
        <button
          onClick={() => {
            setQuery("");
            setTypeFilter("all");
            setSourceFilter("all");
            setTrail([]);
            rotation.current = { x: -0.85, y: 0 };
            time.current = 0;
            setPaused(true);
            setRevision((value) => value + 1);
            onFit?.();
          }}
        >
          Fit all stars
        </button>
        <button
          aria-pressed={allNames}
          onClick={() => setAllNames((value) => !value)}
        >
          {allNames ? "Hide extra file names" : "Show all file names"}
        </button>
        <button
          onClick={() => {
            rotation.current = { x: -0.85, y: 0 };
            time.current = 0;
            setPaused(true);
            setRevision((value) => value + 1);
          }}
        >
          Reset rotation
        </button>
      </div>
      <div className="memory-galaxy-workspace">
        <details
          className="memory-galaxy-inspector"
          open={railOpen}
          onToggle={(event) => setRailOpen(event.currentTarget.open)}
        >
          <summary>Search and inspect Galaxy</summary>
          <div className="memory-galaxy-library">
            <label>
              Search Galaxy names
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find in this loaded view"
              />
            </label>
            <label>
              Galaxy file type
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
              >
                <option value="all">All types ({catalogFiles.length})</option>
                {[...catalog.counts].map(([kind, count]) => (
                  <option key={kind} value={kind}>
                    {galaxyTypes[kind].label} ({count})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Galaxy source
              <select
                value={sourceFilter}
                onChange={(event) => setSourceFilter(event.target.value)}
              >
                <option value="all">All loaded sources</option>
                {[...catalog.sources].map(([id, source]) => (
                  <option key={id} value={id}>
                    {source.label} ({source.count})
                  </option>
                ))}
              </select>
            </label>
            <p>
              {files.length} of {catalogFiles.length} loaded objects match.
              Counts cover this view, not all storage.
            </p>
            <div className="memory-galaxy-legend">
              {[...catalog.counts].map(([kind, count]) => (
                <span key={kind}>
                  <i style={{ background: galaxyTypes[kind].color }} />
                  {galaxyTypes[kind].label}: {count}
                </span>
              ))}
            </div>
            <details>
              <summary>Matching objects ({files.length})</summary>
              <div className="memory-galaxy-results">
                {files.map((file) => (
                  <button
                    key={file.id}
                    disabled={file.resourceAvailable === false}
                    onClick={() => {
                      setPaused(true);
                      setRailOpen(true);
                      focusZoom.current = 1;
                      setTrail((previous) =>
                        previous.at(-1) === file.id
                          ? previous
                          : [...previous, file.id],
                      );
                    }}
                  >
                    Focus {file.name}
                  </button>
                ))}
              </div>
            </details>
            {!files.length && (
              <p>
                No matching objects in this view. Clear filters or use another
                directory page.
              </p>
            )}
            {!focused && (
              <p>
                Select a star or search result to inspect it. Selection does not
                read its file.
              </p>
            )}
            {focused && (
              <div
                className="memory-star-focus"
                role="region"
                aria-label={
                  resourceMode
                    ? "Selected storage object"
                    : "Selected file star"
                }
              >
                <strong>{focused.name}</strong>
                <p>
                  {galaxyTypes[galaxyType(focused)].label} · {focused.folder}
                </p>
                <small>
                  Listed identity; current access is checked when opened.
                </small>
                <p>
                  {neighborhood.nearby.length} nearby{" "}
                  {resourceMode ? "resource" : "file"}{" "}
                  {neighborhood.nearby.length === 1 ? "star" : "stars"}
                  {neighborhood.omitted
                    ? ` · ${neighborhood.omitted} more in the file list`
                    : ""}
                </p>
                <small>
                  {resourceMode
                    ? "Other entries in this directory page or selected-location list."
                    : "Same folder or an explicit note link."}
                </small>
                <div>
                  <button onClick={() => onRead(focused)}>
                    {resourceMode
                      ? focused.resourceKind === "file"
                        ? "Show file actions"
                        : `Enter ${focused.resourceKind || "folder"}`
                      : "Open file"}
                  </button>
                  {trail.length > 1 && (
                    <button
                      onClick={() =>
                        setTrail((previous) => previous.slice(0, -1))
                      }
                    >
                      Back
                    </button>
                  )}
                  <button onClick={() => setTrail([])}>Return to galaxy</button>
                </div>
              </div>
            )}
          </div>
        </details>
        <div
          className={`memory-spiral-stage ${focused ? "is-file-focused" : ""}`}
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
            tabIndex={0}
            onKeyDown={(event) => {
              if (
                !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                  event.key,
                )
              )
                return;
              event.preventDefault();
              rotation.current.y +=
                event.key === "ArrowRight"
                  ? 0.15
                  : event.key === "ArrowLeft"
                    ? -0.15
                    : 0;
              rotation.current.x +=
                event.key === "ArrowDown"
                  ? 0.15
                  : event.key === "ArrowUp"
                    ? -0.15
                    : 0;
              setPaused(true);
              setRevision((value) => value + 1);
            }}
            role="img"
            aria-label="Original animated spiral galaxy style with selectable file stars"
          />
          <div className="memory-spiral-label" aria-hidden="true">
            <small>GULF WING</small>
            <strong>M E M O R Y</strong>
            <span>{reduced ? "REDUCED MOTION" : "FILE CONSTELLATION"}</span>
          </div>
          {visible.map((file) => (
            <button
              key={file.id}
              ref={(element) => {
                if (element) buttons.current.set(file.id, element);
                else buttons.current.delete(file.id);
              }}
              disabled={file.resourceAvailable === false}
              className={`memory-file-star ${resourceMode ? `is-resource-${file.resourceKind || "file"}` : ""} ${selectedId === file.id || focused?.id === file.id ? "is-selected" : ""}`}
              aria-label={`${focused?.id === file.id ? "Open" : "Focus"} ${resourceMode ? file.resourceKind || "file" : "file"} star: ${file.folder} / ${file.name}${file.resourceAvailable === false ? " (unavailable)" : ""}`}
              title={`${file.folder} / ${file.name}`}
              onPointerEnter={() => setPaused(true)}
              onFocus={() => setPaused(true)}
              onClick={() => focusStar(file)}
            >
              <i aria-hidden="true" />
              <span>{file.name}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="memory-spiral-key">
        {resourceMode
          ? "Select a drive, folder or file object to focus it, then enter the location or show file actions. Only the current directory page is shown."
          : "Select a file star to zoom into its neighborhood, then open it or explore a nearby file star."}{" "}
        The faint background stars are decorative. Drag in any direction to
        rotate, or focus the background and use arrow keys. Names appear on
        hover, focus or selection; the file list is always available.
      </p>
    </div>
  );
}
