import test from "node:test";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { STEPHANIE_VOICE, ELEVEN_MODEL } from "./elevenlabs-lib.mjs";
const script = fileURLToPath(
  new URL("./setup-nexus-elevenlabs.mjs", import.meta.url),
);
const config = {
  version: 1,
  enabled: true,
  secretType: "windows-dpapi",
  protectedKey: "01000000" + "ab".repeat(100),
  voiceId: STEPHANIE_VOICE,
  model: ELEVEN_MODEL,
  dailyCharacters: 1000,
  cloudSpeechAccepted: true,
};
function run(root, action, input) {
  return spawnSync(process.execPath, [script, action], {
    input,
    env: { ...process.env, GW_SYNC_DATA_DIR: root },
    timeout: 10000,
  });
}
test("setup CLI accepts Windows BOM encodings, stores only encrypted fields and disables without resetting usage", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "eleven-setup-"));
  try {
    for (const bytes of [
      Buffer.from("\uFEFF" + JSON.stringify(config)),
      Buffer.concat([
        Buffer.from([255, 254]),
        Buffer.from(JSON.stringify(config), "utf16le"),
      ]),
    ]) {
      const result = run(root, "--save", bytes);
      assert.equal(result.status, 0);
      assert.equal(JSON.parse(result.stdout.toString()).ok, true);
      assert.equal(
        JSON.parse(await readFile(path.join(root, "elevenlabs.json"), "utf8"))
          .protectedKey,
        config.protectedKey,
      );
      assert.doesNotMatch(result.stdout.toString(), /01000000/);
    }
    const usage = JSON.stringify({ day: "2026-11-12", used: 88 });
    await writeFile(path.join(root, "elevenlabs-allowance.json"), usage);
    const result = run(root, "--disable");
    assert.equal(result.status, 0);
    assert.equal(
      JSON.parse(await readFile(path.join(root, "elevenlabs.json"), "utf8"))
        .enabled,
      false,
    );
    assert.equal(
      await readFile(path.join(root, "elevenlabs-allowance.json"), "utf8"),
      usage,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("CLI rejects malformed credentials and config without exposing inputs or overwriting saved setup", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "eleven-redaction-"));
  try {
    assert.equal(run(root, "--save", JSON.stringify(config)).status, 0);
    const before = await readFile(path.join(root, "elevenlabs.json"), "utf8");
    const secret = "do not print this private string";
    for (const [action, value] of [
      ["--check", { key: secret }],
      ["--save", { ...config, voiceId: secret }],
      ["--save", { ...config, protectedKey: secret }],
    ]) {
      const result = run(root, action, JSON.stringify(value));
      assert.equal(result.status, 1);
      const output = result.stdout.toString() + result.stderr.toString();
      assert.ok(!output.includes(secret));
      assert.equal(JSON.parse(result.stdout.toString()).ok, false);
      assert.equal(
        await readFile(path.join(root, "elevenlabs.json"), "utf8"),
        before,
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
