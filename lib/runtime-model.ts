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
export type RuntimeModelCheck = {
  checkId: string;
  slot: string;
  receiptSha256: string;
  creationRunId: string;
  alias: string;
  sha256: string;
  bytes: number;
  recordedCreationState: RuntimeModelReceipt["state"];
  expectedManifestDigest: string | null;
  currentManifestDigest: string | null;
  state:
    | "matches-record"
    | "present-unconfirmed"
    | "changed"
    | "not-listed"
    | "coverage-incomplete"
    | "identity-unavailable";
  details: import("./local-model-details").LocalModelDetails | null;
  checkedAt: string;
  notice: string;
};
