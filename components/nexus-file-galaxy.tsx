"use client";
import SelectedFolderBrowser from "./selected-folder-browser";
import OriginalFileLinks from "./original-file-links";
import AnimatedFileGalaxy, { type GalaxyFile } from "./animated-file-galaxy";
import GalaxyFileDialog from "./galaxy-file-dialog";
import { useEffect, useRef, useState } from "react";
import type { SourceMap } from "@/lib/source-map";
type FileNode = GalaxyFile;
export default function NexusFileGalaxy({ enabled }: { enabled: boolean }) {
  const [map, setMap] = useState<SourceMap | null>(null),
    [error, setError] = useState(""),
    [filter, setFilter] = useState(""),
    [catalogQuery, setCatalogQuery] = useState(""),
    [catalogSearch, setCatalogSearch] = useState({ query: "", offset: 0 }),
    [zoom, setZoom] = useState(1),
    [storageMode, setStorageMode] = useState(false);
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
        body: JSON.stringify({ action: "map", ...catalogSearch }),
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
  }, [enabled, reload, catalogSearch]);
  const nodes: FileNode[] =
    map?.folders.flatMap((folder) =>
      folder.files.map((file) => ({
        ...file,
        folder: folder.label,
        rootId: folder.id,
      })),
    ) || [];
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
      <h3>Your Memory Galaxy</h3>
      <p>
        Select a bright file star to zoom in, explore nearby file stars, or open
        the selected file.
      </p>
      <div
        className="nexus-draft-actions"
        role="group"
        aria-label="Galaxy source view"
      >
        <button
          aria-pressed={!storageMode}
          onClick={() => setStorageMode(false)}
        >
          Knowledge stars
        </button>
        <button aria-pressed={storageMode} onClick={() => setStorageMode(true)}>
          Storage galaxy
        </button>
      </div>
      <SelectedFolderBrowser
        key={storageMode ? "storage" : "selected-list"}
        galaxy={storageMode}
        enabled={enabled}
        onRead={(file) => void read(file)}
        onAccessLost={() => {
          epoch.current++;
          request.current?.abort();
          setMap(null);
          setReading(null);
          setSelected(null);
          setWarnings([]);
          setBusy(false);
          setError(
            "Controller access is required. Private file view was cleared.",
          );
        }}
      />
      <div hidden={storageMode}>
        <details className="memory-galaxy-tools">
          <summary>Find files and view controls</summary>
          <form
            className="nexus-draft-actions"
            onSubmit={(event) => {
              event.preventDefault();
              setFilter("");
              setCatalogSearch({ query: catalogQuery.trim(), offset: 0 });
            }}
          >
            <label>
              Search all indexed file names
              <input
                type="search"
                maxLength={200}
                value={catalogQuery}
                onChange={(event) => setCatalogQuery(event.target.value)}
              />
            </label>
            <button type="submit">Search indexed catalog</button>
            <button
              type="button"
              onClick={() => {
                setCatalogQuery("");
                setFilter("");
                setCatalogSearch({ query: "", offset: 0 });
              }}
            >
              Show indexed catalog
            </button>
          </form>
          <p>
            Search covers current selected-folder index names and source labels.
            It does not scan drives or search file contents.
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
        </details>
        {error && <p role="status">{error}</p>}
        {warnings.map((warning, i) => (
          <p key={i}>{warning}</p>
        ))}
        {!map && !error && <p>Loading selected sources…</p>}
        {map && (
          <>
            <p>
              {shown.length} indexed file stars available · {map.withheld}{" "}
              changed or unavailable files withheld
              {map.omitted
                ? ` · ${map.omitted} more indexed files outside this view`
                : ""}
            </p>
            {map.catalog && (
              <section aria-label="Indexed catalog coverage">
                <p>
                  {map.catalog.matched} matching files in {map.total} current
                  indexed files
                  {map.catalog.query ? ` for “${map.catalog.query}”` : ""}. This
                  page shows up to {map.catalog.limit} stars.
                </p>
                <p>
                  {map.catalog.resolvedDirectedLinks} resolved directed note
                  links · {map.catalog.unresolvedTargets} unresolved targets ·{" "}
                  {map.catalog.partialLinkFiles} notes with bounded link
                  extraction. Counts cover the current selected-folder index,
                  not all laptop files or owner memory. Links use extracted
                  text; no connection lines are drawn.
                </p>
                <div className="nexus-draft-actions">
                  {map.catalog.offset > 0 && (
                    <button
                      onClick={() => {
                        setFilter("");
                        setCatalogSearch({
                          query: map.catalog.query,
                          offset: Math.max(0, map.catalog.offset - 80),
                        });
                      }}
                    >
                      Previous indexed stars
                    </button>
                  )}
                  {map.catalog.nextOffset !== null && (
                    <button
                      onClick={() => {
                        setFilter("");
                        setCatalogSearch({
                          query: map.catalog.query,
                          offset: map.catalog.nextOffset!,
                        });
                      }}
                    >
                      Next indexed stars
                    </button>
                  )}
                </div>
              </section>
            )}
            {!shown.length && (
              <p>
                No current files match this view. Choose folders locally or
                refresh the selected-file index.
              </p>
            )}
            <AnimatedFileGalaxy
              files={shown}
              selectedId={selected?.id}
              zoom={zoom}
              onFit={() => setZoom(1)}
              onRead={(file) => void read(file)}
            />
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
      </div>
      {(busy || reading) && selected && (
        <GalaxyFileDialog
          onClose={() => {
            epoch.current++;
            request.current?.abort();
            setBusy(false);
            setReading(null);
            setSelected(null);
          }}
        >
          <section
            className="nexus-draft-file"
            aria-label="Indexed file viewer"
          >
            <h4 tabIndex={-1} ref={viewer}>
              {selected.name}
            </h4>
            <p>
              Indexed text preview. Use the original-file controls to open or
              download the unchanged source.
            </p>
            {busy ? (
              <p>Reading current indexed text…</p>
            ) : (
              <pre className="nexus-galaxy-text">{reading?.answer}</pre>
            )}
            {reading?.fileRead && (
              <OriginalFileLinks
                id={reading.fileRead.id}
                hash={reading.fileRead.hash}
                name={selected.name}
              />
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
            </div>
          </section>
        </GalaxyFileDialog>
      )}
    </section>
  );
}
