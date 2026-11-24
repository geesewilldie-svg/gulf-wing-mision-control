import path from "node:path";
import type { FileRoot } from "@/lib/local-files";
import {
  readBrowseGrants,
  directoryIdentity,
} from "../../scripts/storage-browse-lib.mjs";
import { fileRoots, selectedDirectory } from "./local-files";
import { SyncError } from "./sync-store";
export type BrowserRoot = FileRoot & {
  browseOnly?: boolean;
  storageType?: "drive" | "folder";
  expectedIdentity?: string;
};
export async function browserRoots(): Promise<BrowserRoot[]> {
  const indexed = await fileRoots();
  try {
    const dir = path.resolve(
      process.env.GW_SYNC_DATA_DIR || path.join(process.cwd(), ".gulf-wing"),
    );
    const grants = await readBrowseGrants(dir);
    if (grants.some((g) => indexed.some((root) => root.id === g.id)))
      throw Error();
    return [
      ...indexed,
      ...grants.map((g) => ({
        id: g.id,
        label: g.label,
        path: g.path,
        kind: "folder" as const,
        browseOnly: true,
        storageType: g.type as "drive" | "folder",
        expectedIdentity: g.identity,
      })),
    ];
  } catch {
    throw new SyncError(
      503,
      "Browse-only storage settings could not be read. Existing selections were preserved.",
    );
  }
}
export async function browserDirectory(root: BrowserRoot, relative = "") {
  if (root.expectedIdentity) {
    const base = await selectedDirectory(root);
    if (directoryIdentity(base.stat) !== root.expectedIdentity)
      throw new SyncError(
        409,
        "Storage location was replaced. Select it again locally before browsing.",
      );
  }
  return selectedDirectory(root, relative);
}
