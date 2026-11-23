import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkCopilotAccess,
  COPILOT_TEST_PROMPT,
} from "./copilot-check-lib.mjs";
try {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0] !== "--confirm-public-test")
    throw Error(
      `This sends one fixed prompt to GitHub Copilot and may consume your plan allowance: ${COPILOT_TEST_PROMPT}\nRun with --confirm-public-test only to send it. No Nexus files or conversation are attached.`,
    );
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const receipt = await checkCopilotAccess({
    dataDir: path.resolve(
      process.env.GW_SYNC_DATA_DIR || path.join(root, ".gulf-wing"),
    ),
    confirmed: true,
  });
  console.log(`Copilot public test: ${receipt.state}. ${receipt.detail}`);
  if (receipt.state !== "verified") process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
