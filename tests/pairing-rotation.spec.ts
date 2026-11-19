import { test, expect } from "@playwright/test";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  beginGoogle,
  finishGoogle,
  googleStatus,
  GOOGLE_SCOPE,
} from "../lib/server/google-accounts";
import { config, token, session } from "../lib/server/sync-store";
async function rotate(dir: string) {
  return new Promise<number | null>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["scripts/sync-setup.mjs", "--rotate"],
      {
        cwd: process.cwd(),
        env: { ...process.env, GW_SYNC_DATA_DIR: dir },
        stdio: "ignore",
      },
    );
    child.on("error", reject);
    child.on("exit", resolve);
  });
}
test("pairing rotation preserves legacy Google tokens while revoking sessions, including repeated rotations", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "nexus-rotation-"));
  const previous = process.env.GW_SYNC_DATA_DIR;
  process.env.GW_SYNC_DATA_DIR = dir;
  try {
    await writeFile(
      path.join(dir, "sync-config.json"),
      JSON.stringify({
        version: 1,
        pairingHash: "a".repeat(64),
        signingSecret: "b".repeat(64),
      }),
    );
    await writeFile(
      path.join(dir, "google-oauth.json"),
      JSON.stringify({
        clientId: "fixture.apps.googleusercontent.com",
        clientSecret: "fixture-secret",
      }),
    );
    const start = await beginGoogle();
    await finishGoogle(start.state, start.state, "fixture-code", (async (
      url: any,
    ) =>
      Response.json(
        String(url).includes("/token")
          ? {
              access_token: "fixture-access",
              refresh_token: "fixture-refresh",
              expires_in: 3600,
              scope: GOOGLE_SCOPE,
            }
          : { email: "fixture@example.test", email_verified: true },
      )) as typeof fetch);
    const encrypted = await readFile(path.join(dir, "google-tokens.json"));
    for (let i = 0; i < 2; i++) {
      const old = (await config())!;
      const oldToken = token(old, "controller");
      expect(await rotate(dir)).toBe(0);
      const next = (await config())!;
      expect(next.signingSecret).not.toBe(old.signingSecret);
      expect(next.pairingHash).not.toBe(old.pairingHash);
      expect(next.googleEncryptionSecret).toBe("b".repeat(64));
      expect(
        session(
          new Request("http://localhost", {
            headers: { cookie: `gw_sync_session=${oldToken}` },
          }),
          next,
        ),
      ).toBeNull();
      expect((await googleStatus()).accounts[0].email).toBe(
        "fixture@example.test",
      );
      expect(await readFile(path.join(dir, "google-tokens.json"))).toEqual(
        encrypted,
      );
    }
  } finally {
    if (previous === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
});
test("rotation refuses malformed configuration without replacing it", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "nexus-invalid-rotation-"));
  try {
    const file = path.join(dir, "sync-config.json");
    const original = JSON.stringify({
      version: 1,
      pairingHash: "a".repeat(64),
      signingSecret: "b".repeat(64),
      googleEncryptionSecret: "",
    });
    await writeFile(file, original);
    expect(await rotate(dir)).toBe(1);
    expect(await readFile(file, "utf8")).toBe(original);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
