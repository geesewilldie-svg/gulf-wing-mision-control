import { runMaintenance } from "./maintenance";
import type { MaintenanceAction } from "./maintenance";
import { laptopOperation, recentLaptopOperations } from "./laptop-operations";

export function maintenanceAnswer(
  result: Awaited<ReturnType<typeof runMaintenance>>,
) {
  return {
    engine: "Nexus laptop maintenance",
    operationId: result.id,
    answer: `${result.message}\nOperation reference: ${result.id}. Result: ${result.outcome}.`,
    sources: [],
    warnings:
      result.outcome === "complete"
        ? []
        : [
            "Readiness is not confirmed. Review the laptop logs before retrying.",
          ],
    routing: {
      mode: "local",
      selected: [],
      reason:
        "A named local maintenance operation using the laptop's existing permission setting; no model or cloud provider was used.",
    },
  };
}

export async function conversationMaintenance(
  action: MaintenanceAction,
  signal?: AbortSignal,
  requestId?: unknown,
) {
  return maintenanceAnswer(await runMaintenance(action, signal, requestId));
}
export function conversationOperation(id: string) {
  if (id === "recent") {
    const operations = recentLaptopOperations();
    return {
      engine: "Nexus laptop maintenance",
      sources: [],
      warnings: [],
      answer: operations.length
        ? `Recent saved laptop operations:\n${operations.map((operation) => `${operation.action}: ${operation.outcome}. Reference: ${operation.id}`).join("\n")}`
        : "No durable laptop operation records are saved yet. Older audit-only operations are not imported.",
      operationChoices: operations.map((operation) => ({
        id: operation.id,
        label: `${operation.action}: ${operation.outcome}`,
      })),
      routing: {
        mode: "local",
        selected: [],
        reason:
          "Saved local operation records only; no maintenance process or model was started.",
      },
    };
  }
  return maintenanceAnswer(laptopOperation(id));
}
