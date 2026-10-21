import { test, expect } from "@playwright/test";
test("agents, mission creation, status and venture isolation", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Mission control." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Codex Engineering", exact: false })
    .click();
  await expect(
    page.getByRole("button", { name: "Codex Engineering", exact: false }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Assign demo mission" }).click();
  await page.getByLabel("Mission title").fill("Test flight readiness");
  await expect(page.getByLabel("Demo agent")).toHaveValue("Codex");
  await page.getByRole("button", { name: "Create demo mission" }).click();
  await expect(
    page.getByRole("heading", { name: "Test flight readiness" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Advance Test flight readiness" })
    .click();
  await expect(page.getByRole("status")).toContainText("In progress");
  if (isMobile)
    await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Aviation", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Review fleet readiness report" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Test flight readiness" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Simulate agent event" }).click();
  await expect(page.getByRole("status")).toContainText(
    "simulated status report",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
test("window controls and keyboard-accessible movement", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Minimize Model costs", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Model costs", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Model costs", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Model costs", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Maximize Model costs", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Model costs", exact: true }),
  ).toHaveClass(/maximized/);
  await page
    .getByRole("button", { name: "Restore Model costs", exact: true })
    .click();
  if (!isMobile) {
    const panel = page.getByRole("region", {
      name: "Model costs",
      exact: true,
    });
    const before = await panel.boundingBox();
    await page
      .getByRole("button", { name: "Move Model costs", exact: true })
      .focus();
    await page.keyboard.press("ArrowLeft");
    const after = await panel.boundingBox();
    expect(after!.x).toBe(before!.x - 16);
    const handle = page.getByRole("button", {
      name: "Resize Model costs",
      exact: true,
    });
    await handle.scrollIntoViewIfNeeded();
    const box = await panel.boundingBox();
    await handle.focus();
    await page.keyboard.press("ArrowDown");
    expect((await panel.boundingBox())!.height).toBe(box!.height + 16);
    const grip = await handle.boundingBox();
    await page.mouse.move(grip!.x + 5, grip!.y + 5);
    await page.mouse.down();
    await page.mouse.move(grip!.x - 20, grip!.y + 35, { steps: 5 });
    await page.mouse.up();
    expect((await panel.boundingBox())!.height).toBeGreaterThan(
      box!.height + 16,
    );
  }
});
test("dialog validates input and closes with Escape", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New mission" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Create demo mission" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
