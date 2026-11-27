export const FRAME_MAX_BYTES = 512 * 1024;
export const FRAME_MAX_EDGE = 960;
export const DEFAULT_FRAME_QUESTION =
  "Briefly describe what is visible in this frame.";
export function frameQuestion(value: unknown): string | null {
  return typeof value === "string" &&
    value.length <= 1000 &&
    value.trim().length > 0 &&
    !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/.test(
      value,
    )
    ? value.trim()
    : null;
}
export type LocalFrameAnalysis = {
  runId: string;
  model: string;
  digest: string;
  reportedModel: string;
  source: "camera" | "screen";
  capturedAt: string;
  completedAt: string;
  width: number;
  height: number;
  bytes: number;
  elapsedMs: number;
  text: string;
  question: string;
  reportedOutputTokens: number | null;
  notice: string;
};
