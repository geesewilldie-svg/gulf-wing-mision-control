import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
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

export async function persistBusiness(next: BusinessState, restoring = false) {
  const target = file(),
    tmp = `${target}.${randomBytes(8).toString("hex")}.tmp`;
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  try {
    try {
      const previous = await fs.readFile(target, "utf8");
      const raw = JSON.parse(previous);
      if (restoring || raw.workflowVersion !== 1) {
        const dir = path.join(path.dirname(target), "business-backups");
        await fs.mkdir(dir, { recursive: true, mode: 0o700 });
        await fs.writeFile(
          path.join(
            dir,
            "before-workflow-" +
              Date.now() +
              "-" +
              randomBytes(8).toString("hex") +
              ".json",
          ),
          previous,
          { mode: 0o600, flag: "wx" },
        );
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    await fs.writeFile(tmp, JSON.stringify(next), { mode: 0o600, flag: "wx" });
    await fs.rename(tmp, target);
  } finally {
    await fs.rm(tmp, { force: true });
  }
}
