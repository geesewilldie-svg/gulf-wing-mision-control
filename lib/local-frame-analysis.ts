export const FRAME_MAX_BYTES = 512 * 1024;
export const FRAME_MAX_EDGE = 960;
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
  reportedOutputTokens: number | null;
  notice: string;
};
