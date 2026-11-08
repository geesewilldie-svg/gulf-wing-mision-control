import type { KnowledgeDocument } from "./nexus";
export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedAt: string;
  url: string;
};
export type DriveSelection = { accountId: string; fileId: string };
export type DriveEntry = DriveSelection &
  DriveFile & { indexedAt: string; documents: KnowledgeDocument[] };
export type DriveStatus = {
  selected: DriveSelection[];
  entries: Omit<DriveEntry, "documents">[];
  refreshedAt: string | null;
  warnings: string[];
};
