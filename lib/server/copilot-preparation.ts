import path from "node:path";
import { copilotPreparationStatus } from "../../scripts/copilot-profile-lib.mjs";
export async function copilotPreparation() {
  return copilotPreparationStatus(
    path.resolve(process.env.GW_SYNC_DATA_DIR || ".gulf-wing"),
  );
}
