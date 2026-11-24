export type JournalReceiptView = {
  reference: string;
  taskId: string;
  revision: number;
  at: string | null;
  state: "saved" | "skipped" | "unconfirmed";
  indexing: "indexed" | "pending" | "not-recorded";
  workspace?: string;
  currentTaskLabel?: string;
  filename?: string;
  sha256?: string;
  bytes?: number;
  indexedFile?: { id: string; hash: string };
};
