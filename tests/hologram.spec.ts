import { test, expect } from "@playwright/test";

test("hologram modes, agent selection and mission handoff work", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  for (const mode of ["Core", "Galaxy", "Graph"]) {
    await page.getByRole("button", { name: mode, exact: true }).click();
    await expect(
      page.getByRole("button", { name: mode, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("img", { name: new RegExp(`${mode} hologram`) }),
    ).toBeVisible();
  }
  await page
    .getByRole("button", { name: "Claude Research", exact: true })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Selected agent details" }),
  ).toContainText("Claude");
  await page.getByRole("button", { name: "Assign demo mission" }).click();
  await expect(page.getByLabel("Demo agent")).toHaveValue("Claude");
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});

test("pause stops animation, rotation works while paused, and resume animates", async ({
  page,
}) => {
  await page.goto("/");
  const canvas = page.locator(".holo-stage canvas");
  await expect(canvas).toBeVisible();
  await page.getByRole("button", { name: "Pause hologram motion" }).click();
  await expect(page.locator(".holo-caption")).toContainText("MOTION PAUSED");
  const frame = () =>
    canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  const paused = await frame();
  await page.waitForTimeout(150);
  expect(await frame()).toBe(paused);
  await canvas.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(frame).not.toBe(paused);
  await page.getByRole("button", { name: "Reset hologram view" }).click();
  await expect.poll(frame).toBe(paused);
  await page.getByRole("button", { name: "Resume hologram motion" }).click();
  await expect.poll(frame).not.toBe(paused);
});

test("expanded hologram fits the viewport and Escape restores the view", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Expand hologram" }).click();
  const bounds = await page.locator(".holo-expanded").boundingBox();
  const viewport = page.viewportSize()!;
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
  const dialog = page.getByRole("dialog", { name: "Expanded agent hologram" });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Codex Engineering", exact: true })
    .focus();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Core", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Expand hologram" }),
  ).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Expand hologram" }),
  ).toHaveAttribute("aria-pressed", "false");
});

test("reduced motion renders a static hologram and preserves usable controls", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".holo-caption")).toContainText("REDUCED MOTION");
  const canvas = page.locator(".holo-stage canvas");
  const frame = await canvas.evaluate((element: HTMLCanvasElement) =>
    element.toDataURL(),
  );
  await page.waitForTimeout(150);
  expect(
    await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL()),
  ).toBe(frame);
  await page.getByRole("button", { name: "Galaxy", exact: true }).click();
  await expect(
    page.getByRole("img", { name: /Galaxy hologram/ }),
  ).toBeVisible();
  expect(
    await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL()),
  ).not.toBe(frame);
});
