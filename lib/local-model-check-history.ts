import type { LocalModelCheck } from "./local-model-check";
export type LocalModelCheckRecord = Omit<
  LocalModelCheck,
  "notice" | "receiptState"
>;
export type LocalModelCheckHistory = {
  state: "available" | "not-created" | "unavailable";
  readAt: string;
  records: LocalModelCheckRecord[];
  validRecords: number;
  withheldRecords: number;
  occupiedSlots: number;
  capacity: 100;
  pageLimit: 20;
  notice: string;
};
