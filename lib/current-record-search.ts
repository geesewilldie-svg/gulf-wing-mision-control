import type { Scope } from "./foundation/contracts";
export type RecordWorkspace = Scope | "all";
export type CurrentRecord = {
  id: string;
  revision: number;
  type: "owner" | "task";
  scope: Scope;
  kind: string;
  updatedAt: string;
  title: string;
  excerpt: string;
  contentHash: string;
  sourceTruncated: boolean;
};
export type CurrentRecordSearch = {
  workspace: RecordWorkspace;
  query: string;
  page: number;
  stamp: string;
  readAt: string;
  totalRecords: number;
  scannedRecords: number;
  matchedRecords: number;
  outsideBudgetRecords: number;
  truncatedRecords: number;
  pageSize: 20;
  records: CurrentRecord[];
  notice: string;
};
export type CurrentRecordInspection = CurrentRecord & {
  content: string;
  inspectedAt: string;
  provenance: "owner-stated" | "unverified-task-record";
};
