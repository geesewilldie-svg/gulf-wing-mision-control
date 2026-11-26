export type HubArtifact = {
  filename: string;
  bytes: number | null;
  sha256: string | null;
  gitBlobId: string | null;
};
export type HubModelMetadata = {
  repository: string;
  revision: string;
  requestedRevision: string;
  checkedAt: string;
  sourceUrl: string;
  license: string | null;
  access: "public" | "gated-auto" | "gated-manual" | "unknown";
  reportedArtifacts: number;
  validArtifacts: number;
  withheldArtifacts: number;
  omittedArtifacts: number;
  knownBytes: number;
  unknownSizeArtifacts: number;
  totalBytes: number | null;
  sha256ReportedArtifacts: number;
  artifacts: HubArtifact[];
  downloaded: false;
  inferenceReady: false;
  notice: string;
};
export function hubRepository(value: unknown): string | null {
  return typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}\/[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(
      value,
    ) &&
    !value.includes("..") &&
    !value.endsWith(".git")
    ? value
    : null;
}
