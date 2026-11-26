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
