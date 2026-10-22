import { test, expect } from "@playwright/test";
import { STORAGE_KEY } from "../lib/workspace";

test("opens an independent display and shares live mission updates and resets", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.locator(".screen-controls summary").click();
  const popupPromise = page.waitForEvent("popup");
  await page
    .getByRole("article")
    .filter({
      has: page.getByRole("heading", { name: "Mission board", exact: true }),
    })
    .getByRole("button", { name: "Open display", exact: true })
    .click();
  const display = await popupPromise;
  await expect(display).toHaveURL(/\/display\?view=missions/);
  await expect(
    display.getByRole("region", { name: "Presentation missions" }),
  ).toContainText("Prepare portfolio briefing");
  await page.getByRole("button", { name: "New mission", exact: true }).click();
  await page.getByLabel("Mission title").fill("Multi-screen briefing");
  await page.getByRole("button", { name: "Create demo mission" }).click();
  await expect(
    display.getByRole("heading", { name: "Multi-screen briefing" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Advance Multi-screen briefing" })
    .click();
  await expect(
    display.locator(".display-board>div").filter({
      has: display.getByRole("heading", {
        name: "In progress",
        exact: false,
      }),
    }),
  ).toContainText("Multi-screen briefing");
  await display.reload();
  await expect(
    display.getByRole("heading", { name: "Multi-screen briefing" }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await expect(
    display.getByRole("heading", { name: "Multi-screen briefing" }),
  ).toHaveCount(0);
  await expect(
    display.getByRole("heading", { name: "Prepare portfolio briefing" }),
  ).toBeVisible();
  await display.close();
  expect(context.pages()).toHaveLength(1);
});

test("presentation never overwrites storage and local agent exploration leaves controller selection intact", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY))
    .not.toBeNull();
  const before = await page.evaluate(
    (key) => localStorage.getItem(key),
    STORAGE_KEY,
  );
  const display = await context.newPage();
  await display.goto("/display?view=core");
  await display
    .getByRole("button", { name: "Claude Research", exact: true })
    .click();
  await expect(display.locator(".display-panel-title")).toContainText("Claude");
  expect(
    await display.evaluate((key) => localStorage.getItem(key), STORAGE_KEY),
  ).toBe(before);
  await expect(
    page.getByRole("button", { name: "GPT Strategy", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await display.close();
});

test("dashboard tabs receive saved updates without loops and reject malformed incoming data", async ({
  page,
  context,
}) => {
  await page.goto("/");
  const other = await context.newPage();
  await other.goto("/");
  await page
    .getByRole("button", { name: "Claude Research", exact: true })
    .click();
  await expect(
    other.getByRole("button", { name: "Claude Research", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await other
    .getByRole("button", { name: "Hermes Operations", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Hermes Operations", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await other.evaluate(
    (key) => localStorage.setItem(key, "{invalid"),
    STORAGE_KEY,
  );
  await expect(
    page.getByRole("alert", { name: "Workspace storage" }),
  ).toContainText("last valid view");
  await expect(
    page.getByRole("button", { name: "Hermes Operations", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await other.close();
});

test("blocked pop-ups show a usable same-tab fallback", async ({ page }) => {
  await page.addInitScript(() => {
    window.open = () => null;
  });
  await page.goto("/");
  await page.locator(".screen-controls summary").click();
  await page
    .getByRole("button", { name: "Open display", exact: true })
    .first()
    .click();
  await expect(page.locator(".screen-message")).toContainText("blocked");
  await page
    .locator('a[href="/display?view=overview"]')
    .click();
  await expect(page).toHaveURL(/display\?view=overview/);
  await expect(
    page.getByRole("region", { name: "Presentation agent network" }),
  ).toBeVisible();
});

for (const view of [
  "overview",
  "core",
  "missions",
  "activity",
  "unrecognized",
]) {
  test(`display ${view} fits mobile and a 4K TV viewport`, async ({ page }) => {
    await page.goto(`/display?view=${view}`);
    await expect(page.locator(".display-title")).toContainText(
      "Gulf Wing Holding Company",
    );
    if (view === "unrecognized")
      await expect(
        page.getByRole("region", { name: "Presentation agent network" }),
      ).toBeVisible();
    for (const width of [320, 3840]) {
      await page.setViewportSize({ width, height: width === 320 ? 844 : 2160 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
      await expect(
        page.getByRole("button", { name: "Fullscreen", exact: true }),
      ).toBeVisible();
    }
  });
}

test("fullscreen denial is handled without breaking the display", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = async () => {
      throw new DOMException("Denied", "NotAllowedError");
    };
  });
  await page.goto("/display?view=missions");
  await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("could not start");
  await expect(
    page.getByRole("region", { name: "Presentation missions" }),
  ).toBeVisible();
});

test("unsupported fullscreen explains the device fallback", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(Element.prototype, "requestFullscreen", {
      value: undefined,
    }),
  );
  await page.goto("/display?view=activity");
  await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("unavailable");
});

test("browser fullscreen can be entered and exited from the display", async ({
  page,
}) => {
  await page.goto("/display?view=missions");
  await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Exit fullscreen", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Exit fullscreen", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Fullscreen", exact: true }),
  ).toBeVisible();
});
