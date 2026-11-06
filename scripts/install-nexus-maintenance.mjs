import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (process.platform !== "win32") {
  console.error("Run this setup on the Windows laptop. No changes made.");
  process.exitCode = 1;
} else {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some((a) => a !== "--disable"))
    throw Error("Supported option: --disable");
  const dir = path.resolve(
    process.env.GW_SYNC_DATA_DIR || path.join(root, ".gulf-wing"),
  );
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  await fs.writeFile(
    path.join(dir, "maintenance.json"),
    JSON.stringify({ version: 1, enabled: !args.includes("--disable") }),
    { mode: 0o600 },
  );
  console.log(
    args.includes("--disable")
      ? "Nexus maintenance disabled."
      : "Nexus maintenance enabled for paired controllers. Open Nexus → Connections → Laptop maintenance.",
  );
  console.log(
    "No SSH, firewall, administrator privileges, downloads or arbitrary shell execution added.",
  );
}
