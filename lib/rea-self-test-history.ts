export type ReaSelfTestRecord = {
  runId: string;
  state: "verified" | "cancelled" | "failed-or-unconfirmed";
  startedAt: string;
  finishedAt: string;
  reaVersion: string;
  nodeVersion?: string;
  evidenceId?: string;
  evidenceSha256?: string;
  completeness?: string;
};
export type ReaSelfTestHistory = {
  state: "available" | "not-created" | "unavailable";
  readAt: string;
  records: ReaSelfTestRecord[];
  validRecords: number;
  withheldRecords: number;
  occupiedSlots: number;
  capacity: 100;
  pageLimit: 20;
  generalSiteInspectionReady: false;
  notice: string;
};
