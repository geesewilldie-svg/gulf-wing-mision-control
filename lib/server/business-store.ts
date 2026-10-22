import { promises as fs } from "node:fs";
import path from "node:path";
import {
  emptyBusiness,
  validBusiness,
  type BusinessState,
} from "@/lib/business";
import { SyncError } from "./sync-store";
const file = () =>
  path.resolve(
    process.env.GW_SYNC_DATA_DIR || path.join(process.cwd(), ".gulf-wing"),
    "business.json",
  );
export async function loadBusiness(): Promise<BusinessState> {
  try {
    const raw = JSON.parse(await fs.readFile(file(), "utf8"));
    const clean = validBusiness(raw);
    return {
      ...clean,
      audit: Array.isArray(raw.audit)
        ? raw.audit.filter((s: unknown) => typeof s === "string").slice(0, 100)
        : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return emptyBusiness();
    throw new SyncError(
      503,
      "Business storage could not be read. Existing data is preserved.",
    );
  }
}
