import { test, expect } from "@playwright/test";
import { verifyNexusAssets } from "../scripts/nexus-update-lib.mjs";
test("updater verifies the current production page's real JavaScript and CSS responses", async () => {
  expect(await verifyNexusAssets()).toBeGreaterThan(0);
});
