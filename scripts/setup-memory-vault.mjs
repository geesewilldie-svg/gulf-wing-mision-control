import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { selectedVaults, prepareMemoryVault } from "./memory-vault-lib.mjs";
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
  const roots = await selectedVaults(dir);
  if (!roots.length) throw Error("Select an Obsidian vault in Nexus first.");
  roots.forEach((root, i) =>
    console.log(`${i + 1}. ${root.label}: ${root.path}`),
  );
  const selected = Number(await prompt.question("Vault number: ")) - 1;
  if (!Number.isInteger(selected) || !roots[selected])
    throw Error("No vault selected.");
  console.log(
    "This prepares or re-enables Nexus Memory Snapshots in that vault and permits paired controllers to save reviewed, new Markdown snapshots there. Existing notes are not overwritten. No automatic synchronization or provider sharing is enabled.",
  );
  if (
    (await prompt.question("Enable reviewed snapshot saves? (Y/N) "))
      .trim()
      .toUpperCase() !== "Y"
  )
    throw Error("No changes made.");
  console.log(
    "Prepared: " + (await prepareMemoryVault(dir, roots[selected].id)),
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  prompt.close();
}
