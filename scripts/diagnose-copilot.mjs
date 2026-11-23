import path from "node:path";
import { fileURLToPath } from "node:url";
import { diagnoseCopilot } from "./copilot-diagnostic-lib.mjs";
try {
  if (process.argv.length !== 2) throw Error();
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const result = await diagnoseCopilot({
    dataDir: path.resolve(
      process.env.GW_SYNC_DATA_DIR || path.join(root, ".gulf-wing"),
    ),
  });
  for (const [name, value] of Object.entries(result))
    console.log(`${name}: ${value}`);
  console.log(
    "Only local version/help and saved status were inspected. No model prompt was sent; reservations and settings were preserved.",
  );
} catch {
  console.error(
    "Local diagnostic could not finish. Settings and reservations were preserved; no model prompt was sent.",
  );
  process.exitCode = 1;
}
