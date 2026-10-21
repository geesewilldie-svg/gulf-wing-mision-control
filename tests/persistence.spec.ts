import { test, expect, type Page } from "@playwright/test";
import { createWorkspace, STORAGE_KEY } from "../lib/workspace";

async function createMission(page: Page, title: string) {
  await page.getByRole("button", { name: "New mission", exact: true }).click();
  await page.getByLabel("Mission title").fill(title);
  await page.getByRole("button", { name: "Create demo mission" }).click();
}
async function chooseVenture(page: Page, name: string, isMobile: boolean) {
  if (isMobile)
    await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name, exact: true }).click();
}
async function saved(page: Page) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    STORAGE_KEY,
  );
}

test("missions, statuses, selected venture/agent and activity survive reload", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  await chooseVenture(page, "Aviation", isMobile);
  await page
    .getByRole("button", { name: "Codex Engineering", exact: false })
    .click();
  await createMission(page, "Saved aviation mission");
  const advance = page.getByRole("button", {
    name: "Advance Saved aviation mission",
  });
  await advance.click();
  await advance.click();
  await page.getByRole("button", { name: "Simulate agent event" }).click();
  await expect
    .poll(
      async () =>
        (await saved(page)).tasks.find(
          (t: { title: string }) => t.title === "Saved aviation mission",
        )?.status,
    )
    .toBe("Complete");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Codex Engineering", exact: false }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("heading", { name: "Saved aviation mission" }),
  ).toBeVisible();
  await expect(
    page.locator(".kanban-column").filter({
      has: page.getByRole("heading", { name: "Complete", exact: false }),
    }),
  ).toContainText("Saved aviation mission");
  await expect(page.locator(".feed")).toContainText(
    "Codex generated a simulated status report",
  );
  await chooseVenture(page, "Co-hosting", isMobile);
  await expect(
    page.getByRole("heading", { name: "Saved aviation mission" }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Draft guest arrival checklist" }),
  ).toBeVisible();
});

test("minimized and maximized panel states survive refresh", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Minimize Agent activity", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Agent activity", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Agent activity", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Maximize Model costs", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Model costs", exact: true }),
  ).toHaveClass(/maximized/);
  await page
    .getByRole("button", { name: "Restore Model costs", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Agent activity", exact: true }),
  ).toBeVisible();
});

test("desktop geometry survives minimize, reload, maximize and mobile reflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const panel = page.getByRole("region", { name: "Model costs", exact: true });
  await page
    .getByRole("button", { name: "Move Model costs", exact: true })
    .focus();
  await page.keyboard.press("ArrowLeft");
  await page
    .getByRole("button", { name: "Resize Model costs", exact: true })
    .focus();
  await page.keyboard.press("ArrowDown");
  const geometry = await panel.getAttribute("style");
  await page
    .getByRole("button", { name: "Minimize Model costs", exact: true })
    .click();
  await page.reload();
  await page.getByRole("button", { name: "Model costs", exact: true }).click();
  await expect(panel).toHaveAttribute("style", geometry!);
  await page
    .getByRole("button", { name: "Maximize Model costs", exact: true })
    .click();
  await page.reload();
  await page
    .getByRole("button", { name: "Restore Model costs", exact: true })
    .click();
  await expect(panel).toHaveAttribute("style", geometry!);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const mobileBounds = await panel.boundingBox();
  expect(mobileBounds!.x).toBeGreaterThanOrEqual(0);
  expect(mobileBounds!.x + mobileBounds!.width).toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(panel).toHaveAttribute("style", geometry!);
});

test("reset can be cancelled and confirmed; restores defaults without removing unrelated storage", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("unrelated-app", "keep me"));
  await createMission(page, "Reset candidate");
  await page
    .getByRole("button", { name: "Minimize Agent activity", exact: true })
    .click();
  await chooseVenture(page, "Aviation", isMobile);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  expect(
    (await saved(page)).tasks.some(
      (t: { title: string }) => t.title === "Reset candidate",
    ),
  ).toBeTruthy();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Review fleet readiness report" }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Demo reset");
  await expect.poll(() => saved(page)).toEqual(createWorkspace());
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Prepare portfolio briefing" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Reset candidate" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Agent activity", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("unrelated-app"))).toBe(
    "keep me",
  );
});

for (const [name, raw] of [
  ["malformed JSON", "{broken"],
  [
    "unsupported version",
    JSON.stringify({ ...createWorkspace(), version: 999 }),
  ],
  [
    "invalid mission",
    JSON.stringify({
      ...createWorkspace(),
      tasks: [{ ...createWorkspace().tasks[0], agent: "Unknown" }],
    }),
  ],
  [
    "invalid layout",
    JSON.stringify({
      ...createWorkspace(),
      panels: { ...createWorkspace().panels, "Model costs": { offset: null } },
    }),
  ],
] as const) {
  test(`recovers from ${name} with a visible warning`, async ({ page }) => {
    await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), {
      key: STORAGE_KEY,
      raw,
    });
    await page.goto("/");
    await expect(
      page.getByRole("alert", { name: "Workspace storage" }),
    ).toContainText("Demo defaults have been restored");
    await expect(
      page.getByRole("heading", { name: "Prepare portfolio briefing" }),
    ).toBeVisible();
    await createMission(page, "Recovery mission");
    await expect(
      page.getByRole("heading", { name: "Recovery mission" }),
    ).toBeVisible();
  });
}

for (const failure of ["blocked", "quota"]) {
  test(`remains usable when storage is ${failure}`, async ({ page }) => {
    await page.addInitScript((failure) => {
      if (failure === "blocked")
        Object.defineProperty(Storage.prototype, "getItem", {
          value: () => {
            throw new DOMException("Blocked", "SecurityError");
          },
        });
      Object.defineProperty(Storage.prototype, "setItem", {
        value: () => {
          throw new DOMException("Unavailable", "QuotaExceededError");
        },
      });
    }, failure);
    await page.goto("/");
    await expect(
      page.getByRole("alert", { name: "Workspace storage" }),
    ).toContainText("Changes will only last until you refresh");
    await createMission(page, "Session mission");
    await expect(
      page.getByRole("heading", { name: "Session mission" }),
    ).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Reset demo", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Session mission" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("alert", { name: "Workspace storage" }),
    ).toBeVisible();
  });
}

test("loads a valid empty workspace without overwriting it during hydration", async ({
  page,
}) => {
  const seed = {
    ...createWorkspace(),
    tasks: [],
    venture: "Future Ventures",
    selected: "Hermes",
  };
  await page.addInitScript(
    ({ key, seed }) => localStorage.setItem(key, JSON.stringify(seed)),
    { key: STORAGE_KEY, seed },
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Hermes Operations", exact: false }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".board-top")).toContainText("0 missions");
  await expect(page.locator(".metrics")).not.toContainText("NaN");
  await expect.poll(() => saved(page)).toEqual(seed);
  expect(errors).toEqual([]);
});

test("constrains saved panel geometry and preserves it through restore", async ({
  page,
}) => {
  const seed = createWorkspace();
  seed.panels["Model costs"] = {
    offset: { x: 99999, y: -99999 },
    size: { width: -1, height: 99999 },
    maximized: false,
  };
  await page.addInitScript(
    ({ key, seed }) => localStorage.setItem(key, JSON.stringify(seed)),
    { key: STORAGE_KEY, seed },
  );
  await page.goto("/");
  await expect
    .poll(async () => (await saved(page)).panels["Model costs"])
    .toEqual({
      offset: { x: 160, y: -160 },
      size: { width: 280, height: 700 },
      maximized: false,
    });
  await page
    .getByRole("button", { name: "Maximize Model costs", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Restore Model costs", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Model costs", exact: true }),
  ).toHaveAttribute("style", /translate\(160px, -160px\)/);
});
