import path from "node:path";
import { fileURLToPath } from "node:url";
import { configureLinkOpening } from "./link-opening-lib.mjs";
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || args.some((arg) => arg !== "--disable"))
      throw Error("Supported option: --disable");
    const repo = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
    );
    await configureLinkOpening(
      path.resolve(
        process.env.GW_SYNC_DATA_DIR || path.join(repo, ".gulf-wing"),
      ),
      !args.includes("--disable"),
    );
    console.log(
      args.includes("--disable")
        ? "Laptop link opening disabled."
        : "Reviewed HTTPS link opening enabled for paired controllers. Each link still needs Open on laptop confirmation.",
    );
    console.log(
      "No page was opened. No account access, browser automation or administrator privileges were added.",
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
