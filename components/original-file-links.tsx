"use client";
export default function OriginalFileLinks({
  id,
  hash,
  name,
}: {
  id: string;
  hash: string;
  name?: string;
}) {
  const extension = name?.toLowerCase().split(".").at(-1);
  if (
    !name ||
    !["pdf", "md", "txt", "xlsx"].includes(extension || "") ||
    !/^[a-f0-9]{24}$/i.test(id) ||
    !/^[a-f0-9]{64}$/i.test(hash)
  )
    return null;
  const url = `/api/sync/files/original?id=${encodeURIComponent(id)}&hash=${encodeURIComponent(hash)}`;
  return (
    <section
      aria-label="Original file actions"
      className="nexus-original-file-actions"
      style={{ marginBlock: "1rem" }}
    >
      <div className="nexus-draft-actions">
        {extension !== "xlsx" && (
          <a href={url} target="_blank" rel="noopener noreferrer">
            {extension === "pdf" ? "Open original PDF" : "Open original text"}
          </a>
        )}
        <a href={url + "&download=1"} target="_blank" rel="noopener noreferrer">
          Download original file
        </a>
      </div>
      <p>
        Access and file version are checked again when opening. Browser support
        determines viewing or download behavior. Source files are not edited.
      </p>
    </section>
  );
}
