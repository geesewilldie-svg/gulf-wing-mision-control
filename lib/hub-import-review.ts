import type { GgufMetadata } from "./gguf-metadata";
export type HubImportReview = {
  slot: string;
  runId: string;
  receiptSha256: string;
  reviewedAt: string;
  repository: string;
  revision: string;
  sourceFilename: string;
  recordedLicense: string;
  bytes: number;
  sha256: string;
  hashCheckedAt: string;
  metadata: GgufMetadata;
  runtime: {
    state: "version-reported" | "unavailable";
    version: string | null;
  };
  hostMemory: {
    totalBytes: number | null;
    freeBytes: number | null;
    sampledAt: string;
  };
  importImplemented: false;
  runtimeStorageVerified: false;
  runtimeImported: false;
  inferenceReady: false;
  blockers: string[];
  notice: string;
};
