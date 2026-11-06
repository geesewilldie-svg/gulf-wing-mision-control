import { promises as fs } from "node:fs";
import path from "node:path";
import {
  validBriefSettings,
  defaultBriefSettings,
  type BriefSettings,
} from "@/lib/daily-brief";
import { SyncError } from "./sync-store";
export const briefFile = () =>
  path.resolve(
    process.env.GW_SYNC_DATA_DIR || path.join(process.cwd(), ".gulf-wing"),
    "daily-brief.json",
  );
export async function loadBriefSettings(): Promise<BriefSettings> {
  try {
    return validBriefSettings(
      JSON.parse(await fs.readFile(briefFile(), "utf8")),
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT")
      return defaultBriefSettings();
    throw new SyncError(
      503,
      "Daily brief storage could not be read. Existing data is preserved.",
    );
  }
}
