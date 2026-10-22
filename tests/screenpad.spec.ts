import { test, expect } from "@playwright/test";

test("ScreenPad opens separately and controls the main workspace", async ({ page }) => {
  await page.goto("/");
  await page.locator(".screen-controls summary").click();
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Open ScreenPad", exact: true }).click();
  const pad = await popupPromise;
  await expect(pad).toHaveURL(/\/screenpad$/);
  await pad.getByRole("group", { name: "ScreenPad agents" }).getByRole("button", { name: "Codex", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Selected agent details" })).toContainText("Codex");
  await pad.getByRole("button", { name: "Advance Review quarterly performance: Queued", exact: true }).click();
  await expect(pad.getByRole("button", { name: "Advance Review quarterly performance: In progress", exact: true })).toBeVisible();
  await pad.reload();
  await expect(pad.getByRole("button", { name: "Advance Review quarterly performance: In progress", exact: true })).toBeVisible();
  await pad.getByLabel("VENTURE", { exact: true }).selectOption("Aviation");
  await expect(page.locator(".breadcrumb")).toContainText("Aviation");
});

for (const viewport of [{ width: 1000, height: 500 }, { width: 800, height: 400 }, { width: 320, height: 640 }]) {
  test(`ScreenPad fits ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/screenpad");
    await expect(page.getByRole("heading", { name: "Mission quick controls" })).toBeVisible();
    await page.getByRole("button", { name: "Graph", exact: true }).click();
    await expect(page.getByText("DEMO SIGNAL TERRAIN", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const buttons = await page.locator(".screenpad-agent-buttons button").evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height));
    expect(buttons.every((height) => height >= 44)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("ScreenPad display-only pairing disables workspace edits", async ({ page }) => {
  await page.request.post("/api/sync/session", { data: { code: process.env.GW_SYNC_TEST_CODE, role: "display" } });
  await page.goto("/screenpad");
  await expect(page.getByText("Display-only session. Pair as a controller to edit missions.")).toBeVisible();
  await expect(page.getByLabel("VENTURE", { exact: true })).toBeDisabled();
  for (const button of await page.locator(".screenpad-agent-buttons button, .screenpad-queue button").all()) {
    await expect(button).toBeDisabled();
  }
});
