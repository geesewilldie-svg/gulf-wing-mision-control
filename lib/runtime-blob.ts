export type RuntimeBlobReceipt = {
  version: 1;
  kind: "runtime-blob-stage";
  runId: string;
  slot: string;
  receiptSha256: string;
  sha256: string;
  bytes: number;
  state: "started" | "staged" | "unconfirmed" | "cancelled" | "failed";
  startedAt: string;
  finishedAt?: string;
  reusedExisting?: boolean;
  runtimeImported: false;
  inferenceReady: false;
};
export type RuntimeBlobStatus =
  | { state: "not-recorded" | "unavailable" }
  | { state: "recorded"; receipt: RuntimeBlobReceipt };
export type RuntimeBlobCheck = {
  checkId: string;
  slot: string;
  receiptSha256: string;
  stageRunId: string;
  sha256: string;
  bytes: number;
  recordedStageState: RuntimeBlobReceipt["state"];
  state: "present-reported" | "missing-reported";
  checkedAt: string;
  runtimeImported: false;
  inferenceReady: false;
  notice: string;
};
