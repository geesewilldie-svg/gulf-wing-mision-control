"use client";
import { useState } from "react";
import type { SourceMap } from "../lib/source-map";

export function NexusSourceMap({
  map,
  disabled,
  onRead,
}: {
  map: SourceMap;
  disabled: boolean;
  onRead: (id: string, hash: string, name: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const query = filter.trim().toLowerCase();
  const folders = map.folders.map((folder) => ({
    ...folder,
    files: folder.files.filter((file) =>
      `${folder.label} ${file.name}`.toLowerCase().includes(query),
    ),
  }));
  return (
    <section aria-label="Connected source map">
      <h4>Your connected sources</h4>
      <p>
        Folders contain the files listed below. Obsidian note connections come
        from explicit wiki links in current indexed text.
      </p>
      <p>
        {map.total} current indexed files · {map.withheld} changed or
        unavailable files withheld
      </p>
      {map.omitted > 0 && (
        <p>
          Showing the first 80 files; {map.omitted} more are not shown. Use file
          search for other indexed files.
        </p>
      )}
      <label>
        Filter folders and file names
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          type="search"
        />
      </label>
      {folders.map((folder) => (
        <section
          className="nexus-draft-file"
          key={folder.id}
          aria-label={`Folder: ${folder.label}`}
        >
          <h4>{folder.label}</h4>
          <p>
            {folder.kind === "obsidian" ? "Obsidian vault" : "Selected folder"}
          </p>
          <ul>
            {folder.files.map((file) => (
              <li key={file.id} className="nexus-draft-file">
                <p style={{ overflowWrap: "anywhere" }}>{file.name}</p>
                <p>{file.sections} indexed text sections</p>
                {file.noteLinks && (
                  <div>
                    <p>
                      <strong>Linked notes</strong>
                    </p>
                    {!file.noteLinks.links.length && (
                      <p>No resolved wiki links in the inspected text.</p>
                    )}
                    {file.noteLinks.links.map((link) => (
                      <div className="nexus-draft-file" key={link.id}>
                        <p style={{ overflowWrap: "anywhere" }}>{link.name}</p>
                        <p>
                          Explicit wiki link from {file.name}. This does not
                          establish a business relationship.
                        </p>
                        <div className="nexus-draft-actions">
                          <button
                            disabled={disabled}
                            aria-label={`Read linked note: ${file.name} to ${link.name}`}
                            onClick={() =>
                              onRead(link.id, link.hash, link.name)
                            }
                          >
                            Read linked note
                          </button>
                        </div>
                      </div>
                    ))}
                    {file.noteLinks.unresolved > 0 && (
                      <p>
                        {file.noteLinks.unresolved} wiki links could not be
                        resolved uniquely to a current indexed note in this
                        vault. Target names are withheld.
                      </p>
                    )}
                    {file.noteLinks.partial && (
                      <p>
                        Partial link coverage: inspected text or displayed
                        connections reached a limit.
                      </p>
                    )}
                  </div>
                )}
                <div className="nexus-draft-actions">
                  <button
                    disabled={disabled}
                    onClick={() => onRead(file.id, file.hash, file.name)}
                    aria-label={`Read file: ${folder.label} / ${file.name}`}
                  >
                    Read file
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {!folder.files.length && (
            <p>
              {query
                ? "No matching displayed files in this folder."
                : "No current indexed files shown in this folder."}
            </p>
          )}
        </section>
      ))}
      {!folders.length && (
        <p>
          No folders selected. Choose folders locally with
          Setup-Nexus-Folders.cmd.
        </p>
      )}
      <p>
        Only the selected-folder index is shown. Source access is checked again
        when you read a file.
      </p>
    </section>
  );
}
