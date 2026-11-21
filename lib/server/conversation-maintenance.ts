import { runMaintenance } from "./maintenance";
import type { MaintenanceAction } from "./maintenance";

export function maintenanceAnswer(
  result: Awaited<ReturnType<typeof runMaintenance>>,
) {
  return {
    engine: "Nexus laptop maintenance",
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
) {
  return maintenanceAnswer(await runMaintenance(action, signal));
}
