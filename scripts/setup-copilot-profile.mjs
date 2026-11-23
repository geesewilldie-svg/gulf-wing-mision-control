import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import {
  prepareCopilotProfile,
  COPILOT_VERSION,
} from "./copilot-profile-lib.mjs";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some((arg) => arg !== "--login"))
    throw Error("Supported option: --login");
  const dataDir = path.resolve(
    process.env.GW_SYNC_DATA_DIR || path.join(repo, ".gulf-wing"),
  );
  const entrypoint =
    process.env.GW_NEXUS_COPILOT_ENTRYPOINT ||
    path.join(
      process.env.APPDATA || "",
      "npm",
      "node_modules",
      "@github",
      "copilot",
      "npm-loader.js",
    );
  const plan = await prepareCopilotProfile(dataDir, entrypoint);
  const child = spawn(
    process.execPath,
    [
      plan.entrypoint,
      "--no-auto-update",
      ...(args.includes("--login") ? ["login", "--web-flow"] : ["--version"]),
    ],
    { cwd: plan.cwd, env: plan.env, shell: false, stdio: "inherit" },
  );
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  if (code !== 0)
    throw Error(
      "Copilot setup command did not finish successfully. Model access is not verified.",
    );
  console.log(
    args.includes("--login")
      ? "Isolated profile sign-in command finished. No Nexus prompt was sent; model readiness is not verified."
      : `Copilot ${COPILOT_VERSION} profile prepared. Use Sign-In-Nexus-Copilot.cmd for this separate profile. No model prompt was sent.`,
  );
  console.log(
    "This preparation does not enable automatic delegation or change your plan.",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
