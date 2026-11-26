export type HubArchiveReceipt = {
  version: 1;
  runId: string;
  state: "verified";
  repository: string;
  revision: string;
  sourceFilename: string;
  reportedLicense: string;
  bytes: number;
  sha256: string;
  verifiedAt: string;
  archiveFile: string;
  receiptState: "saved";
  downloaded: true;
  runtimeImported: false;
  inferenceReady: false;
  notice: string;
};

export type HubArchiveRecord = {
  slot: string;
  runId: string;
  state:
    | "started"
    | "verified"
    | "failed"
    | "cancelled"
    | "publication-unconfirmed";
  repository: string;
  revision: string;
  sourceFilename: string;
  reportedLicense: string;
  recordedBytes: number;
  recordedSha256: string;
  recordedAt: string;
  fileState:
    | "size-matches-record"
    | "size-mismatch"
    | "missing"
    | "unsafe-or-unavailable";
  fileBytes: number | null;
  partialPresent: boolean | null;
};
export type HubArchiveHistory = {
  state: "available" | "not-created" | "unavailable";
  readAt: string;
  records: HubArchiveRecord[];
  validRecords: number;
  withheldRecords: number;
  occupiedSlots: number;
  capacity: 100;
  pageLimit: 20;
  notice: string;
};
export type HubArchiveVerification = {
  slot: string;
  runId: string;
  checkedAt: string;
  state: "matches-record" | "mismatch";
  recordedBytes: number;
  observedBytes: number;
  recordedSha256: string;
  observedSha256: string | null;
  runtimeImported: false;
  inferenceReady: false;
  notice: string;
};
