import { randomBytes, createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(process.env.GW_SYNC_DATA_DIR || ".gulf-wing");
const config = path.join(root, "sync-config.json");
if (fs.existsSync(config) && !process.argv.includes("--rotate")) {
  console.log(
    "Local sync is already configured. Use npm run sync:setup -- --rotate to issue a new pairing code and revoke paired sessions. Shared workspace data is retained.",
  );
} else {
  const code = randomBytes(16).toString("hex");
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const temp = config + ".tmp";
  fs.writeFileSync(
    temp,
    JSON.stringify({
      version: 1,
      pairingHash: createHash("sha256").update(code).digest("hex"),
      signingSecret: randomBytes(32).toString("hex"),
    }),
    { mode: 0o600 },
  );
  fs.renameSync(temp, config);
  console.log(
    "Local sync configured. Keep this pairing code private and enter it only on your own devices:\n\n" +
      code +
      "\n\nStart the app on this laptop. Open its private Wi-Fi address on each device, then use Connect devices. No public hosting has been enabled.",
  );
}
