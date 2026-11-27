export type RuntimeStorage = {
  state: "observed" | "unavailable";
  source: "server-environment" | "server-user-default";
  reportedModel: string | null;
  availableBytes: number | null;
  requiredBytes: number;
  capacity: "enough-at-check" | "insufficient" | "unknown";
  checkedAt: string;
  notice: string;
};
