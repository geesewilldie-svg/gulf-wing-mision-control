export type RuntimeModelReceipt = {
  version: 1;
  kind: "runtime-model-create";
  runId: string;
  slot: string;
  receiptSha256: string;
  stageRunId: string;
  sha256: string;
  bytes: number;
  alias: string;
  state: "started" | "created" | "unconfirmed" | "cancelled" | "failed";
  startedAt: string;
  finishedAt?: string;
  manifestDigest?: string;
  architecture?: string;
  runtimeImported: boolean;
  inferenceReady: false;
};
export type RuntimeModelStatus =
  | { state: "not-recorded" | "unavailable" }
  | { state: "recorded"; receipt: RuntimeModelReceipt };
