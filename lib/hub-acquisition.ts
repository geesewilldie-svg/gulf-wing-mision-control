import type { HubArtifact } from "./hub-model";
export const HUB_ARCHIVE_FILE_LIMIT = 4 * 1024 ** 3;
export const HUB_ARCHIVE_RESERVE = 1024 ** 3;
export type HubAcquisitionPreview = {
  version: 1;
  previewId: string;
  checkedAt: string;
  repository: string;
  revision: string;
  artifact: HubArtifact;
  license: string | null;
  sourceUrl: string;
  destination: "Nexus private model archive";
  availableBytes: number | null;
  requiredBytes: number | null;
  fileLimitBytes: number;
  reserveBytes: number;
  checks: {
    id: string;
    label: string;
    state: "passed" | "blocked" | "review";
    detail: string;
  }[];
  metadataAndCapacityReady: boolean;
  downloadImplemented: false;
  downloaded: false;
  inferenceReady: false;
  notice: string;
};
