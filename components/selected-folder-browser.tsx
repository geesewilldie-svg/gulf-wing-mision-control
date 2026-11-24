"use client";
import BrowsedOriginalLinks from "./browsed-original-links";
import { useEffect, useRef, useState } from "react";
import type {
  BrowserRoots,
  FolderPage,
  FolderReference,
} from "@/lib/folder-browser";
import type { GalaxyFile } from "./animated-file-galaxy";
export default function SelectedFolderBrowser({
  enabled,
  onRead,
  onAccessLost,
}: {
  enabled: boolean;
  onRead: (file: GalaxyFile) => void;
  onAccessLost?: () => void;
}) {
  const [open, setOpen] = useState(false),
    [roots, setRoots] = useState<BrowserRoots | null>(null),
    [page, setPage] = useState<FolderPage | null>(null),
    [trail, setTrail] = useState<FolderReference[]>([]),
    [cursors, setCursors] = useState<(string | null)[]>([null]),
    [filter, setFilter] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const sequence = useRef(0),
    pending = useRef<AbortController | null>(null);
  async function load(
    nextTrail: FolderReference[] = [],
    nextCursors: (string | null)[] = [null],
  ) {
    const current = ++sequence.current;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    setPage(null);
    setTrail(nextTrail);
    setCursors(nextCursors);
    setFilter("");
    if (!nextTrail.length) setRoots(null);
    try {
      const response = await fetch("/api/sync/files/browser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(
          nextTrail.length
            ? {
                action: "list",
                handle: nextTrail.at(-1)!.handle,
                cursor: nextCursors.at(-1),
              }
            : { action: "roots" },
        ),
      });
      const data = await response.json();
      if (current !== sequence.current || controller.signal.aborted) return;
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setRoots(null);
          setTrail([]);
          setCursors([null]);
          onAccessLost?.();
        }
        throw Error(data.error || "Selected folder is unavailable.");
      }
      if (nextTrail.length) setPage(data);
      else setRoots(data);
    } catch (error) {
      if (current === sequence.current && !controller.signal.aborted)
        setError((error as Error).message);
    } finally {
      if (current === sequence.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (open && enabled) void load();
    else {
      setRoots(null);
      setPage(null);
      setTrail([]);
      setError("");
      setBusy(false);
    }
    return () => {
      sequence.current++;
      pending.current?.abort();
    };
  }, [open, enabled]);
  if (!enabled) return null;
  const entries =
    page?.entries.filter((entry) =>
      entry.name.toLowerCase().includes(filter.toLowerCase()),
    ) || [];
  return (
    <details
      className="nexus-folder-browser"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Explore selected folders</summary>
      {open && (
        <section aria-label="Selected folder explorer">
          <p>
            Browse folders on your laptop. Only locally selected folders and
            browse-only storage appear here. Listing names does not add file
            contents to Nexus. Use Setup-Nexus-Storage.cmd on the laptop to add
            or remove browse-only locations.
          </p>
          <nav aria-label="Folder breadcrumbs" className="nexus-folder-actions">
            <button disabled={busy} onClick={() => void load()}>
              Selected folders
            </button>
            {trail.map((folder, i) => (
              <button
                key={folder.id}
                disabled={busy || i === trail.length - 1}
                aria-current={i === trail.length - 1 ? "location" : undefined}
                onClick={() => void load(trail.slice(0, i + 1))}
              >
                {folder.name}
              </button>
            ))}
          </nav>
          <div className="nexus-folder-actions">
            {!!trail.length && (
              <button
                disabled={busy}
                onClick={() => void load(trail.slice(0, -1))}
              >
                Back to parent folder
              </button>
            )}
            <button disabled={busy} onClick={() => void load(trail)}>
              Reload folder list
            </button>
          </div>
          {busy && <p role="status">Loading folder metadata…</p>}
          {error && <p role="status">{error}</p>}
          {!trail.length && roots && (
            <ul className="nexus-folder-entries">
              {roots.roots.map((root) => (
                <li key={root.id}>
                  <strong>{root.name}</strong>
                  <span>
                    {root.browseOnly
                      ? `${root.storageType === "drive" ? "Drive" : "Folder"} · browse-only; not indexed automatically`
                      : root.kind === "obsidian"
                        ? "Obsidian vault"
                        : "Selected folder"}
                  </span>
                  {root.available && root.handle ? (
                    <button
                      aria-label={`Open selected folder ${root.name}`}
                      disabled={busy}
                      onClick={() =>
                        void load([
                          {
                            id: root.id,
                            name: root.name,
                            handle: root.handle!,
                          },
                        ])
                      }
                    >
                      Open folder
                    </button>
                  ) : (
                    <span>
                      Unavailable on the laptop. Reload after checking the
                      folder.
                    </span>
                  )}
                </li>
              ))}
              {!roots.roots.length && (
                <li>
                  No folders selected. Select folders on the laptop first.
                </li>
              )}
            </ul>
          )}
          {page && (
            <>
              <p>
                {page.visible} items found in this preview ·{" "}
                {page.entries.length} shown on this page
                {page.omitted
                  ? ` · ${page.omitted} hidden, protected or unavailable items omitted`
                  : ""}
                .
              </p>
              {page.limited && (
                <p>
                  Partial directory preview: an entry or time limit was reached.
                  This is not the entire folder.
                </p>
              )}
              <label>
                Filter this page
                <input
                  type="search"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                />
              </label>
              <ul className="nexus-folder-entries">
                {entries.map((entry) => (
                  <li key={entry.id}>
                    <strong>{entry.name}</strong>
                    <span>
                      {entry.kind === "folder"
                        ? "Folder"
                        : `File · ${entry.size?.toLocaleString()} bytes`}
                    </span>
                    {entry.kind === "folder" && entry.handle ? (
                      <button
                        disabled={busy}
                        aria-label={`Open folder ${entry.name}`}
                        onClick={() =>
                          void load([
                            ...trail,
                            {
                              id: entry.id,
                              name: entry.name,
                              handle: entry.handle!,
                            },
                          ])
                        }
                      >
                        Open folder
                      </button>
                    ) : entry.indexed ? (
                      <>
                        <span>Saved preview · checked again when opened</span>
                        <button
                          disabled={busy}
                          aria-label={`Read indexed file ${entry.name}`}
                          onClick={() =>
                            onRead({
                              id: entry.indexed!.id,
                              hash: entry.indexed!.hash,
                              name: entry.relativeName,
                              rootId: page.location.rootId,
                              folder: page.location.rootLabel,
                              noteLinks: null,
                            })
                          }
                        >
                          Read indexed file
                        </button>
                      </>
                    ) : (
                      <span>No saved preview</span>
                    )}
                    {entry.original && (
                      <BrowsedOriginalLinks original={entry.original} />
                    )}
                  </li>
                ))}
                {!entries.length && (
                  <li>
                    {page.entries.length
                      ? "No names match this page filter."
                      : "No permitted entries in this folder preview."}
                  </li>
                )}
              </ul>
              <div className="nexus-folder-actions">
                {cursors.length > 1 && (
                  <button
                    disabled={busy}
                    onClick={() => void load(trail, cursors.slice(0, -1))}
                  >
                    Previous folder page
                  </button>
                )}
                {page.nextCursor && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void load(trail, [...cursors, page.nextCursor])
                    }
                  >
                    Next folder page
                  </button>
                )}
              </div>
            </>
          )}
        </section>
      )}
    </details>
  );
}
