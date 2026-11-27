export type LocalModelCheck = {
  receiptState?: "saved" | "pending";
  runId: string;
  model: string;
  digest: string;
  reportedModel: string;
  checkedAt: string;
  elapsedMs: number;
  state: "passed" | "unexpected-response";
  reportedOutputTokens: number | null;
  notice: string;
};
