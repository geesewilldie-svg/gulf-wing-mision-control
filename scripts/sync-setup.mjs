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
  // Session revocation must not rotate the key protecting saved Google tokens.
  // Legacy installations used signingSecret for both purposes; preserve that
  // encryption root at the first pairing rotation without decrypting any tokens.
  let previous;
  if (fs.existsSync(config)) {
    try {
      const raw = fs.readFileSync(config, "utf8");
      if (raw.length > 10000) throw Error();
      previous = JSON.parse(raw);
      if (
        previous.version !== 1 ||
        !/^[a-f0-9]{64}$/.test(previous.pairingHash) ||
        typeof previous.signingSecret !== "string" ||
        previous.signingSecret.length < 40 ||
        (previous.googleEncryptionSecret !== undefined &&
          (typeof previous.googleEncryptionSecret !== "string" ||
            previous.googleEncryptionSecret.length < 40))
      )
        throw Error();
    } catch {
      console.error(
        "Pairing configuration cannot be safely rotated. Existing configuration and Google credentials are unchanged.",
      );
      process.exit(1);
    }
  }
  const googleEncryptionSecret = previous
    ? (previous.googleEncryptionSecret ?? previous.signingSecret)
    : randomBytes(32).toString("hex");
  const code = randomBytes(16).toString("hex");
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const temp = config + ".tmp";
  fs.writeFileSync(
    temp,
    JSON.stringify({
      ...previous,
      version: 1,
      googleEncryptionSecret,
      pairingHash: createHash("sha256").update(code).digest("hex"),
      signingSecret: randomBytes(32).toString("hex"),
    }),
    { mode: 0o600 },
  );
  fs.renameSync(temp, config);
  console.log(
    "Local sync configured. Keep this pairing code private and enter it only on your own devices:\n\n" +
      code +
      "\n\nGoogle credential encryption is preserved; previously paired sessions are revoked. Start the app on this laptop. Open its private Wi-Fi address on each device, then use Connect devices. No public hosting has been enabled.",
  );
}
