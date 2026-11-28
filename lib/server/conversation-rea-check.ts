import { inspectReaReadiness } from "./rea-readiness";
import { inspectReaProtocol } from "./rea-protocol";
const probes = { preflight: inspectReaReadiness, protocol: inspectReaProtocol };
export async function conversationReaCheck(
  intent: "preflight" | "protocol" | "help",
  signal: AbortSignal,
  read = probes,
) {
  const base = {
    engine: "Nexus REA prerequisites",
    sources: [],
    warnings: [],
    resetHistory: true,
    clearRecordReferences: true,
    routing: {
      mode: "local",
      selected: [],
      reason:
        "Explicit fixed REA check only; no provider, owner context or browser attachment.",
    },
  };
  signal.throwIfAborted();
  if (intent === "help")
    return {
      ...base,
      answer:
        "Say ‘Check REA prerequisites’ to read local runtime/package metadata without executing REA, or ‘Test REA protocol’ to explicitly start a short-lived REA process for initialize/catalog and clean shutdown only. Neither command inspects a website or enables general browser control.",
    };
  if (intent === "preflight") {
    const reaPrerequisites = await read.preflight();
    signal.throwIfAborted();
    return {
      ...base,
      reaPrerequisites,
      answer: `The Nexus Node runtime ${reaPrerequisites.runtimeCompatible ? "meets" : "does not meet"} the pinned REA range. ${reaPrerequisites.packageState === "pinned-metadata" ? "Pinned package metadata was found; integrity and execution are not established by this check." : reaPrerequisites.packageState === "missing" ? "The managed package metadata was not found." : "The managed package metadata is different, unavailable or unsafe; it was not accepted."} No REA process, installation or browser was started. General website inspection remains unconnected.`,
    };
  }
  const reaProtocol = await read.protocol(signal);
  signal.throwIfAborted();
  return {
    ...base,
    engine: "Nexus REA protocol check",
    reaProtocol,
    answer: `The REA initialize/catalog exchange and clean shutdown completed for this check. ${reaProtocol.tools.length} reviewed tool definitions were reported. No tool was called, no browser was attached and no model was contacted. This does not establish general website inspection readiness.`,
  };
}
