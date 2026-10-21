import { defineConfig, devices } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes, createHash } from "node:crypto";
// Disposable host configuration; never use the operator’s real pairing file in tests.
if (!process.env.GW_SYNC_TEST_ROOT) {
  process.env.GW_SYNC_TEST_ROOT = mkdtempSync(
    path.join(tmpdir(), "gw-sync-e2e-"),
  );
  process.env.GW_SYNC_TEST_CODE = randomBytes(16).toString("hex");
  writeFileSync(
    path.join(process.env.GW_SYNC_TEST_ROOT, "sync-config.json"),
    JSON.stringify({
      version: 1,
      pairingHash: createHash("sha256")
        .update(process.env.GW_SYNC_TEST_CODE)
        .digest("hex"),
      signingSecret: randomBytes(32).toString("hex"),
    }),
    { mode: 0o600 },
  );
}
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:3000",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["Galaxy S24"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: "npm run start",
    url: "http://127.0.0.1:3000",
    // Always isolate the sync test host from a developer’s running session.
    reuseExistingServer: false,
    env: { GW_SYNC_DATA_DIR: process.env.GW_SYNC_TEST_ROOT! },
    timeout: 120000,
  },
});
