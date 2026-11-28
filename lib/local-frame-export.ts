import type { LocalFrameAnalysis } from "./local-frame-analysis";

// Explicit projection: never export image bytes, runtime thinking or unknown fields.
export function localFrameExport(result: LocalFrameAnalysis) {
  return {
    version: 1,
    kind: "nexus-local-frame-answer",
    exportedAt: new Date().toISOString(),
    provenance: "unverified-model-description",
    notice:
      "Historical answer about one client-reported captured frame. Not a live observation, verified fact, execution receipt or permission to act. No image is included. This download may contain private question and answer text; it is separate from Nexus memory and knowledge.",
    result: {
      runId: result.runId,
      model: result.model,
      digest: result.digest,
      reportedModel: result.reportedModel,
      source: result.source,
      capturedAt: result.capturedAt,
      completedAt: result.completedAt,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
      elapsedMs: result.elapsedMs,
      question: result.question,
      text: result.text,
      reportedOutputTokens: result.reportedOutputTokens,
    },
  };
}
