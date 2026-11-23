import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { enableWorkJournal, memoryVaultStatus } from "./memory-vault-lib.mjs";
const prompt = createInterface({
  input: process.stdin,
  output: process.stdout,
});
try {
  if (process.platform !== "win32")
    throw Error("Run this on the Windows laptop.");
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const dir = path.resolve(
    process.env.GW_SYNC_DATA_DIR || path.join(repo, ".gulf-wing"),
  );
  const status = await memoryVaultStatus(dir);
  if (status.state !== "ready")
    throw Error(
      "Set up or re-enable the memory vault first. No automatic journal was enabled.",
    );
  console.log(`Destination: ${status.label} / ${status.folder}`);
  console.log(
    "Automatically save NEW completed task artifacts from all workspaces as unverified Markdown notes. No per-note review. Existing notes are not replaced. Later task changes/deletion do not remove these copies. No model or provider is contacted. Stops at 500 journal receipts; uncertain saves are never automatically retried. Disable in Foundation at any time.",
  );
  if (
    (await prompt.question("Enable automatic work journal? (Y/N) "))
      .trim()
      .toUpperCase() !== "Y"
  )
    throw Error("No changes made.");
  console.log(
    "Automatic work journal enabled for task completions from " +
      (await enableWorkJournal(dir)),
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  prompt.close();
}
