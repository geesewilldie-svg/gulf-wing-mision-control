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

for (const width of [320, 390]) {
  test(`maximized panels fit within a ${width}px viewport`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    for (const name of ["Mission board", "Agent activity", "Model costs"]) {
      await page
        .getByRole("button", { name: `Maximize ${name}`, exact: true })
        .click();
      const bounds = await page
        .getByRole("region", { name, exact: true })
        .boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(12);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width - 12);
      await page
        .getByRole("button", { name: `Restore ${name}`, exact: true })
        .click();
    }
  });
}

test("every dialog dismissal restores focus to its opening control", async ({
  page,
}) => {
  await page.goto("/");
  for (const openerName of ["New mission", "Assign demo mission", "Add task"]) {
    const opener = page.getByRole("button", { name: openerName, exact: true });
    for (const method of ["escape", "close", "backdrop", "submit"]) {
      await opener.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByLabel("Mission title")).toBeFocused();
      if (method === "escape") await page.keyboard.press("Escape");
      if (method === "close")
        await page
          .getByRole("button", { name: "Close mission dialog" })
          .click();
      if (method === "backdrop")
        await page
          .locator(".modal-backdrop")
          .click({ position: { x: 5, y: 5 } });
      if (method === "submit") {
        await page
          .getByLabel("Mission title")
          .fill(`Focus regression ${openerName}`);
        await page.getByRole("button", { name: "Create demo mission" }).click();
      }
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(opener).toBeFocused();
    }
  }
});
