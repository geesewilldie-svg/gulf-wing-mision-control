import type { LaptopOperation } from "./server/laptop-operations";

export function laptopOperationFeedback(operation: LaptopOperation) {
  const name = {
    "check-connections": "Check laptop services",
    "start-services": "Start missing Nexus services",
    "open-web-link": "Open a reviewed web link",
  }[operation.action];
  const status =
    operation.outcome === "complete"
      ? operation.action === "open-web-link"
        ? "Handed to Windows"
        : "Operation finished"
      : {
          running: "In progress",
          "needs-attention": "Needs attention",
          "not-started": "Not started",
          unknown: "Result unconfirmed",
        }[operation.outcome];
  const nextStep =
    operation.outcome === "unknown"
      ? "Inspect the laptop before making a new request. This saved request will not run again."
      : operation.outcome === "running"
        ? "Check saved status again shortly. Viewing status does not repeat the action."
        : operation.outcome === "not-started"
          ? "Review local permissions and the saved explanation before making a new request."
          : operation.action === "open-web-link"
            ? "Check the laptop browser yourself. This record does not verify that the page loaded."
            : "Check connection status to confirm current readiness; this is a saved result.";
  return {
    id: operation.id,
    name,
    status,
    detail: operation.message,
    nextStep,
  };
}
export type LaptopOperationFeedback = ReturnType<
  typeof laptopOperationFeedback
>;
