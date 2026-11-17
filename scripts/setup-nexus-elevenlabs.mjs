import { promises as fs } from "node:fs";
import path from "node:path";
import {
  parseElevenInput,
  verifyElevenVoice,
  switchToJessica,
  validateElevenConfig,
  writeElevenConfig,
} from "./elevenlabs-lib.mjs";
const action = process.argv[2];
try {
  if (action === "--jessica") {
    const selected = await switchToJessica();
    console.log(
      `Jessica selected. Existing encrypted key, enabled/disabled state and daily allowance are preserved. Cloud speech is ${selected.enabled ? "enabled" : "disabled"}. No provider request or speech generation was sent. Refresh Nexus voice status after the new app build is running.`,
    );
  } else if (action === "--disable") {
    const root = process.env.GW_SYNC_DATA_DIR || path.resolve(".gulf-wing");
    const value = validateElevenConfig(
      JSON.parse(await fs.readFile(path.join(root, "elevenlabs.json"), "utf8")),
    );
    await writeElevenConfig({ ...value, enabled: false }, root);
    console.log(
      "ElevenLabs disabled for future speech requests. Existing provider charges cannot be reversed.",
    );
  } else {
    const chunks = [];
    let size = 0;
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size > 30000) throw Error();
      chunks.push(chunk);
    }
    const value = parseElevenInput(Buffer.concat(chunks));
    if (action === "--check") await verifyElevenVoice(value.key, value.voiceId);
    else if (action === "--save") await writeElevenConfig(value);
    else throw Error();
    console.log(JSON.stringify({ ok: true }));
  }
} catch (error) {
  const message = /^(KEY_FORMAT|CONNECTION|HTTP_\d{3}|VOICE_CHECK):/.test(
    error?.message ?? "",
  )
    ? error.message
    : "Setup could not complete. Existing configuration is preserved. Check the selected voice, key and daily limit.";
  console.log(JSON.stringify({ ok: false, message }));
  process.exitCode = 1;
}
