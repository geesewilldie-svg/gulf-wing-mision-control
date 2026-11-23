"use client";
import { useEffect, useRef, useState } from "react";
import type { SourceMap } from "@/lib/source-map";
type FileNode = {
  id: string;
  hash: string;
  name: string;
  folder: string;
  rootId: string;
  x: number;
  y: number;
  noteLinks?: { links: { id: string }[] } | null;
};
export default function NexusFileGalaxy({ enabled }: { enabled: boolean }) {
  const [map, setMap] = useState<SourceMap | null>(null),
    [error, setError] = useState(""),
    [filter, setFilter] = useState(""),
    [zoom, setZoom] = useState(1);
  const [warnings, setWarnings] = useState<string[]>([]),
    [reading, setReading] = useState<{
      answer: string;
      fileRead?: {
        id: string;
        hash: string;
        part: number;
        totalParts: number;
      } | null;
    } | null>(null);
  const [selected, setSelected] = useState<FileNode | null>(null),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0);
  const chart = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (chart.current)
      chart.current.scrollLeft = Math.max(
        0,
        (chart.current.scrollWidth - chart.current.clientWidth) / 2,
      );
  }, [map, zoom]);
  const epoch = useRef(0),
    request = useRef<AbortController | null>(null),
    viewer = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const generation = ++epoch.current,
      controller = new AbortController();
    request.current?.abort();
    setMap(null);
    setReading(null);
    setSelected(null);
    setError("");
    setWarnings([]);
    setBusy(false);
    if (enabled)
      void fetch("/api/sync/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "map" }),
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok)
            throw Error(
              "Source map unavailable. Check controller pairing and selected folders.",
            );
          return response.json();
        })
        .then((data) => {
          if (epoch.current === generation) {
            setMap(data.map);
            setWarnings(data.warnings || []);
          }
        })
        .catch(() => {
          if (epoch.current === generation && !controller.signal.aborted)
            setError(
              "Source map unavailable. Check controller pairing and selected folders.",
            );
        });
    return () => {
      epoch.current++;
      controller.abort();
      request.current?.abort();
    };
  }, [enabled, reload]);
  const nodes: FileNode[] =
    map?.folders.flatMap((folder, index) => {
      const angle = (index * 2 * Math.PI) / map.folders.length;
      const cx = map.folders.length === 1 ? 350 : 350 + Math.cos(angle) * 175,
        cy = map.folders.length === 1 ? 210 : 210 + Math.sin(angle) * 105;
      return folder.files.map((file, i) => ({
        ...file,
        folder: folder.label,
        rootId: folder.id,
        x:
          cx +
          Math.cos(i * 2.39996) *
            Math.sqrt((i + 1) / Math.max(1, folder.files.length)) *
            105,
        y:
          cy +
          Math.sin(i * 2.39996) *
            Math.sqrt((i + 1) / Math.max(1, folder.files.length)) *
            78,
      }));
    }) || [];
  const shown = nodes.filter((node) =>
    `${node.folder} ${node.name}`.toLowerCase().includes(filter.toLowerCase()),
  );
  async function read(node: FileNode, part = 1) {
    const generation = ++epoch.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setSelected(node);
    setReading(null);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/sync/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "read-indexed",
          id: node.id,
          hash: node.hash,
          part,
        }),
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) {
        if (epoch.current === generation) {
          setMap(null);
          setWarnings([]);
          setFilter("");
          setSelected(null);
        }
        throw Error(
          "Controller access is required. Private file view was cleared.",
        );
      }
      const data = await response.json();
      if (!response.ok)
        throw Error(
          data.error || "File unavailable. Reload sources before reading.",
        );
      if (epoch.current === generation) {
        setReading(data);
        setTimeout(() => viewer.current?.focus(), 0);
      }
    } catch (value) {
      if (epoch.current === generation && !controller.signal.aborted)
        setError(
          value instanceof Error ? value.message : "File could not be read.",
        );
    } finally {
      if (epoch.current === generation) setBusy(false);
    }
  }
  if (!enabled)
    return (
      <p className="nexus-galaxy-note">
        Pair as a controller to browse real files. No private file nodes are
        shown on presentation screens.
      </p>
    );
  return (
    <section className="nexus-file-galaxy" aria-label="Real file galaxy">
      <h3>Your file galaxy</h3>
      <p>
        Each dot is a current indexed file. Squares group selected folders; cyan
        connections show explicit note links.
      </p>
      <div className="nexus-draft-actions">
        <label>
          Find files
          <input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </label>
        <button
          onClick={() => {
            epoch.current++;
            request.current?.abort();
            setReload((value) => value + 1);
          }}
        >
          Reload sources
        </button>
        <button
          aria-label="Zoom in file galaxy"
          onClick={() => setZoom((value) => Math.min(2.5, value + 0.25))}
        >
          Zoom in
        </button>
        <button
          aria-label="Zoom out file galaxy"
          onClick={() => setZoom((value) => Math.max(0.75, value - 0.25))}
        >
          Zoom out
        </button>
        <button
          onClick={() => {
            setZoom(1);
            setFilter("");
          }}
        >
          Reset view
        </button>
      </div>
      {error && <p role="status">{error}</p>}
      {warnings.map((warning, i) => (
        <p key={i}>{warning}</p>
      ))}
      {!map && !error && <p>Loading selected sources…</p>}
      {map && (
        <>
          <p>
            {shown.length} file dots shown · {map.withheld} changed or
            unavailable files withheld
            {map.omitted
              ? ` · ${map.omitted} more indexed files outside this view`
              : ""}
          </p>
          {!shown.length && (
            <p>
              No current files match this view. Choose folders locally or
              refresh the selected-file index.
            </p>
          )}
          <div className="nexus-galaxy-chart" ref={chart}>
            <svg
              viewBox={`${350 - 350 / zoom} ${210 - 210 / zoom} ${700 / zoom} ${420 / zoom}`}
              role="group"
              aria-label="Indexed file nodes and connections"
            >
              {map.folders.map((folder, index) => {
                const angle = (index * 2 * Math.PI) / map.folders.length,
                  cx =
                    map.folders.length === 1
                      ? 350
                      : 350 + Math.cos(angle) * 175,
                  cy =
                    map.folders.length === 1
                      ? 210
                      : 210 + Math.sin(angle) * 105;
                return (
                  <g key={folder.id}>
                    {shown
                      .filter((node) => node.rootId === folder.id)
                      .map((node) => (
                        <line
                          key={node.id}
                          x1={cx}
                          y1={cy}
                          x2={node.x}
                          y2={node.y}
                          stroke="#36566d"
                        >
                          <title>
                            Folder membership: {folder.label} contains{" "}
                            {node.name}
                          </title>
                        </line>
                      ))}
                    <rect
                      x={cx - 5}
                      y={cy - 5}
                      width="10"
                      height="10"
                      fill="#bba5ff"
                    />
                    <text
                      x={cx}
                      y={cy - 14}
                      textAnchor="middle"
                      fill="#c4b3ee"
                      fontSize="11"
                    >
                      {folder.label}
                    </text>
                  </g>
                );
              })}
              {shown.flatMap((node) =>
                (node.noteLinks?.links || []).map((link) => {
                  const target = shown.find((other) => other.id === link.id);
                  return target ? (
                    <line
                      key={`${node.id}-${link.id}`}
                      x1={node.x}
                      y1={node.y}
                      x2={target.x}
                      y2={target.y}
                      stroke="#4ddcf1"
                      strokeWidth="2"
                    >
                      <title>
                        {node.name} explicitly links to {target.name}
                      </title>
                    </line>
                  ) : null;
                }),
              )}
              {shown.map((node) => (
                <g
                  key={node.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Read indexed file: ${node.folder} / ${node.name}`}
                  onClick={() => void read(node)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      void read(node);
                    }
                  }}
                >
                  <title>
                    {node.folder} / {node.name}
                  </title>
                  <circle cx={node.x} cy={node.y} r="32" fill="transparent" />
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={selected?.id === node.id ? 8 : 5}
                    fill={selected?.id === node.id ? "#ffffff" : "#59daef"}
                    stroke="#113f54"
                  />
                  <text
                    x={node.x}
                    y={node.y + 21}
                    textAnchor="middle"
                    fontSize="14"
                    fill="#d6e8f2"
                  >
                    {node.name.length > 28
                      ? node.name.slice(0, 25) + "…"
                      : node.name}
                  </text>
                </g>
              ))}
            </svg>
          </div>
          <details>
            <summary>Browse file list</summary>
            <div className="nexus-draft-actions">
              {shown.map((node) => (
                <button key={node.id} onClick={() => void read(node)}>
                  {node.folder} / {node.name}
                </button>
              ))}
            </div>
          </details>
        </>
      )}
      {(busy || reading) && selected && (
        <section className="nexus-draft-file" aria-label="Indexed file viewer">
          <h4 tabIndex={-1} ref={viewer}>
            {selected.name}
          </h4>
          <p>
            Indexed text preview; original document viewing is not implemented
            here.
          </p>
          {busy ? (
            <p>Reading current indexed text…</p>
          ) : (
            <pre className="nexus-galaxy-text">{reading?.answer}</pre>
          )}
          <div className="nexus-draft-actions">
            {reading?.fileRead &&
              reading.fileRead.part < reading.fileRead.totalParts && (
                <button
                  onClick={() =>
                    void read(selected, reading.fileRead!.part + 1)
                  }
                >
                  Next part
                </button>
              )}
            <button
              onClick={() => {
                epoch.current++;
                request.current?.abort();
                setBusy(false);
                setReading(null);
                setSelected(null);
              }}
            >
              Close file
            </button>
          </div>
        </section>
      )}
    </section>
  );
}
