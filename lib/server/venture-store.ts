import { promises as fs } from "node:fs";
import path from "node:path";
import { validOperations, type Operations } from "@/lib/venture-operations";
import { SyncError } from "./sync-store";
export const operationsFile = () =>
  path.resolve(
    process.env.GW_SYNC_DATA_DIR || path.join(process.cwd(), ".gulf-wing"),
    "ventures.json",
  );
export async function loadOperations(): Promise<Operations> {
  try {
    return validOperations(
      JSON.parse(await fs.readFile(operationsFile(), "utf8")),
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT")
      return { revision: 0, records: [] };
    throw new SyncError(
      503,
      "Venture storage could not be read. Existing data is preserved.",
    );
  }
}
export async function ventureKnowledge() {
  const state = await loadOperations();
  return state.records.map((r) => ({
    id: "venture-" + r.id,
    source: "Saved " + r.venture + " operations",
    location: r.category + " · revision " + state.revision,
    text: [
      r.title,
      "Status: " + r.status,
      "Owner: " + (r.owner || "Unassigned"),
      "Due: " + (r.due || "Unscheduled"),
      r.notes,
      ...r.checks.map(
        (c) =>
          (c.done ? "Operator marked reviewed: " : "Pending review: ") +
          c.label,
      ),
      "Manually recorded planning evidence. Checklist completion is not regulatory approval or authorization to dispatch.",
    ].join("\n"),
  }));
}
