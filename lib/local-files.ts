export type FileRoot = {
  id: string;
  label: string;
  kind: "folder" | "obsidian";
  path: string;
};
export type IndexedFile = {
  id: string;
  rootId: string;
  name: string;
  modifiedAt: string;
  size: number;
  hash: string;
  documents: { id: string; source: string; location: string; text: string }[];
};
export type RootScan = {
  rootId: string;
  label: string;
  kind: FileRoot["kind"];
  indexed: number;
  skipped: number;
  issues: string[];
  partial: boolean;
};
export type FileSearchStatus = {
  roots: { id: string; label: string; kind: FileRoot["kind"] }[];
  scannedAt: string | null;
  scans: RootScan[];
  files: number;
  stale: number;
  warning?: string;
};
