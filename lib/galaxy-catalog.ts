export type CatalogObject = {
  id: string;
  name: string;
  folder: string;
  rootId: string;
  resourceKind?: "drive" | "folder" | "file";
};
export const galaxyTypes = {
  drive: { label: "Drives", color: "#c7a4ff" },
  folder: { label: "Folders", color: "#ffd28d" },
  text: { label: "Text & Markdown", color: "#6edaff" },
  pdf: { label: "PDFs", color: "#ffa8d7" },
  spreadsheet: { label: "Spreadsheets", color: "#8bf0ca" },
  picture: { label: "Pictures", color: "#b7a0ff" },
  document: { label: "Other documents", color: "#93b9ff" },
  file: { label: "Other files", color: "#c5c9dc" },
} as const;
export type GalaxyType = keyof typeof galaxyTypes;
export function galaxyType(
  file: Pick<CatalogObject, "name" | "resourceKind">,
): GalaxyType {
  if (file.resourceKind === "drive" || file.resourceKind === "folder")
    return file.resourceKind;
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  if (extension && ["md", "txt"].includes(extension)) return "text";
  if (extension === "pdf") return "pdf";
  if (extension === "xlsx") return "spreadsheet";
  if (extension && ["png", "jpg", "jpeg"].includes(extension)) return "picture";
  if (extension && ["docx", "pptx", "csv"].includes(extension))
    return "document";
  return "file";
}
export function galaxyCatalog<T extends CatalogObject>(
  files: T[],
  query: string,
  type: string,
  rootId: string,
) {
  const counts = new Map<GalaxyType, number>();
  const sources = new Map<string, { label: string; count: number }>();
  for (const file of files) {
    const kind = galaxyType(file);
    counts.set(kind, (counts.get(kind) || 0) + 1);
    const source = sources.get(file.rootId);
    sources.set(file.rootId, {
      label: file.folder,
      count: (source?.count || 0) + 1,
    });
  }
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return {
    counts,
    sources,
    files: files.filter(
      (file) =>
        (type === "all" || galaxyType(file) === type) &&
        (rootId === "all" || file.rootId === rootId) &&
        terms.every((term) =>
          `${file.folder} ${file.name}`.toLocaleLowerCase().includes(term),
        ),
    ),
  };
}
