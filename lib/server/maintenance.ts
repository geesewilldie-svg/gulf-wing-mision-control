import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import {
  claimLaptopOperation,
  finishLaptopOperation,
} from "./laptop-operations";
import { SyncError } from "./sync-store";
const root = () =>
  path.resolve(
    process.env.GW_SYNC_DATA_DIR || path.join(process.cwd(), ".gulf-wing"),
  );
export const maintenanceActions = [
  "check-connections",
  "start-services",
] as const;
export type MaintenanceAction = (typeof maintenanceActions)[number];
export function parseMaintenanceAction(value: unknown): MaintenanceAction {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new SyncError(400, "Choose a supported maintenance action.");
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).length !== 1 ||
    !maintenanceActions.includes(v.action as MaintenanceAction)
  )
    throw new SyncError(
      400,
      "Only named maintenance actions are accepted; command text and arguments are not allowed.",
    );
  return v.action as MaintenanceAction;
}
export async function maintenanceEnabled() {
  try {
    const c = JSON.parse(
      await fs.readFile(path.join(root(), "maintenance.json"), "utf8"),
    );
    return c.version === 1 && c.enabled === true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw new SyncError(503, "Maintenance configuration cannot be read.");
  }
}
export function maintenancePlan(action: MaintenanceAction) {
  switch (action) {
    case "check-connections":
      return {
        script: "scripts/check-nexus-connections.mjs",
        args: [],
        timeout: 30_000,
      };
    case "start-services":
      return {
        script: "scripts/start-nexus.mjs",
        args: ["--no-browser"],
        timeout: 180_000,
      };
    default:
      throw new SyncError(400, "Unsupported maintenance action.");
  }
}
export async function runMaintenance(
  action: MaintenanceAction,
  signal?: AbortSignal,
  requestId?: unknown,
) {
  signal?.throwIfAborted();
  if (process.platform !== "win32")
    throw new SyncError(
      409,
      "Maintenance actions must run on the Windows laptop.",
    );
  if (!(await maintenanceEnabled()))
    throw new SyncError(403, "Enable maintenance locally on the laptop first.");
  const plan = maintenancePlan(action);
  const claimed = claimLaptopOperation(action, requestId, plan.timeout);
  if (!claimed.execute) return claimed.receipt;
  const id = claimed.receipt.id;
  let dispatched = false;
  const audit = async (state: string) => {
    await fs.appendFile(
      path.join(root(), "maintenance-audit.jsonl"),
      JSON.stringify({ id, action, state, time: new Date().toISOString() }) +
        "\n",
      { mode: 0o600 },
    );
  };
  try {
    await audit("started");
    // Audit I/O yields control. A local revocation during that write must
    // prevent a new child process, rather than relying on the earlier check.
    if (!(await maintenanceEnabled())) {
      await audit("permission-revoked");
      throw new SyncError(
        403,
        "Maintenance was disabled before dispatch. No operation was started.",
      );
    }
    signal?.throwIfAborted();
    dispatched = true;
    const outcome = await new Promise<"complete" | "needs-attention">(
      (resolve) => {
        execFile(
          process.execPath,
          [path.join(process.cwd(), plan.script), ...plan.args],
          {
            cwd: process.cwd(),
            shell: false,
            windowsHide: true,
            timeout: plan.timeout,
            maxBuffer: 64 * 1024,
          },
          (error) => resolve(error ? "needs-attention" : "complete"),
        );
      },
    );
    const result = finishLaptopOperation(
      id,
      outcome,
      outcome === "complete"
        ? "Operation completed. Check connection status to confirm readiness."
        : "Operation needs attention or timed out. Check the private launcher logs on the laptop; retrying does not stop existing services.",
    );
    await audit(outcome);
    return result;
  } catch (error) {
    try {
      finishLaptopOperation(
        id,
        dispatched ? "unknown" : "not-started",
        dispatched
          ? "The final outcome could not be confirmed. Check laptop logs and current service status before a new request."
          : "The operation did not start. Check local maintenance permission or request cancellation.",
      );
    } catch {}
    throw error;
  }
}
