import path from "node:path";
import { createHash } from "node:crypto";
import { scope } from "@/lib/foundation/contracts";
import { listConversationMemory } from "./foundation/store";
import { portableMemory } from "./portable-memory";
import { SyncError } from "./sync-store";
import { writeMemorySnapshot } from "../../scripts/memory-vault-lib.mjs";
export async function memoryVault(body: any) {
  const workspace = scope(body.scope);
  const exportedAt =
    body.op === "memory.vault.preview"
      ? new Date().toISOString()
      : body.exportedAt;
  if (
    typeof exportedAt !== "string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(exportedAt) ||
    !Number.isFinite(Date.parse(exportedAt)) ||
    Math.abs(Date.now() - Date.parse(exportedAt)) > 15 * 60 * 1000
  )
    throw new SyncError(
      409,
      "Preview expired. Review a fresh memory snapshot.",
    );
  const markdown = portableMemory(
    listConversationMemory(workspace),
    workspace,
    exportedAt,
  );
  const sha256 = createHash("sha256").update(markdown).digest("hex");
  if (body.op === "memory.vault.preview")
    return { markdown, sha256, exportedAt, workspace };
  if (body.confirm !== true || body.sha256 !== sha256)
    throw new SyncError(
      409,
      "Memory changed or confirmation is missing. Review a fresh snapshot before saving.",
    );
  try {
    return await writeMemorySnapshot(
      path.resolve(
        process.env.GW_SYNC_DATA_DIR || path.join(process.cwd(), ".gulf-wing"),
      ),
      markdown,
      workspace.toLowerCase().replace(/ /g, "-"),
    );
  } catch {
    throw new SyncError(
      503,
      "Vault save could not be confirmed. Run Setup-Nexus-Memory-Vault.cmd if setup is missing. Check the vault before retrying; an interrupted save may have left a file.",
    );
  }
}
