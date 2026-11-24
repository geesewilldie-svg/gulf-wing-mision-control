"use client";
export default function BrowsedOriginalLinks({
  original,
}: {
  original: { handle: string; view: "picture" | "document" | "download" };
}) {
  const url =
    "/api/sync/files/resource?handle=" + encodeURIComponent(original.handle);
  return (
    <div
      className="nexus-original-file-actions"
      aria-label="Folder original file actions"
    >
      <div className="nexus-draft-actions">
        {original.view !== "download" && (
          <a href={url} target="_blank" rel="noopener noreferrer">
            {original.view === "picture"
              ? "Open picture"
              : "Open original document"}
          </a>
        )}
        <a href={url + "&download=1"} target="_blank" rel="noopener noreferrer">
          Download original file
        </a>
      </div>
      <small>
        Opens the current listed version. No indexing or model call.
      </small>
    </div>
  );
}
