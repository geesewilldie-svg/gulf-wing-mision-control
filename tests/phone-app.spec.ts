import { test, expect } from "@playwright/test";
test("phone app advertises its host scope and valid icons", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBeTruthy();
  const manifest = await response.json();
  expect(manifest.start_url).toBe("/nexus");
  expect(manifest.scope).toBe("/");
  expect(manifest.display).toBe("standalone");
  for (const icon of manifest.icons) {
    const image = await request.get(icon.src);
    expect(image.headers()["content-type"]).toContain("image/png");
    expect((await image.body()).subarray(1, 4).toString()).toBe("PNG");
  }
});
test("Android setup explains host limitations and handles install dismissal", async ({ page }) => {
  await page.goto("/phone");
  await expect(page.getByRole("heading", { name: "Nexus on your Android phone" })).toBeVisible();
  await expect(page.getByText(/localhost on a phone refers/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Install Nexus", exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, { prompt: async () => {}, userChoice: Promise.resolve({ outcome: "dismissed" }) });
    window.dispatchEvent(event);
  });
  await page.getByRole("button", { name: "Install Nexus", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Installation dismissed");
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await expect(page.getByRole("status")).toContainText("Nexus installed");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});
