import { test, expect } from "@playwright/test";
import { fixtureRole } from "./helpers/access";

test("Core and Graph rotate past previous pitch limits and direct fullscreen falls back visibly", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    HTMLElement.prototype.requestFullscreen = function () {
      return Promise.reject(new Error("Unavailable in fixture"));
    };
  });
  await page.goto("/");
  for (const mode of ["Core", "Graph"]) {
    await page.getByRole("button", { name: mode, exact: true }).click();
    await page
      .getByRole("button", { name: `Fullscreen ${mode}`, exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Expanded agent hologram",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("status")).toContainText(
      "Expanded view remains available",
    );
    const canvas = page.getByRole("img", {
      name: new RegExp(`^${mode} hologram`),
    });
    await canvas.focus();
    for (let i = 0; i < 20; i++) await page.keyboard.press("ArrowUp");
    const frame = await canvas.evaluate((element: HTMLCanvasElement) =>
      element.toDataURL(),
    );
    await page.keyboard.press("ArrowUp");
    await expect
      .poll(() =>
        canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL()),
      )
      .not.toBe(frame);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }
});

test("Memory Galaxy hides idle labels, reveals focused names and permits full keyboard rotation and fullscreen", async ({
  page,
  context,
}) => {
  await fixtureRole(context);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    HTMLElement.prototype.requestFullscreen = function () {
      return Promise.reject(new Error("Unavailable in fixture"));
    };
  });
  await page.route("**/api/sync/files", (route) =>
    route.fulfill({
      json: {
        map: {
          total: 3,
          withheld: 0,
          omitted: 0,
          folders: [
            {
              id: "root",
              label: "Notes",
              kind: "obsidian",
              files: ["One.md", "Two.md", "Three.md"].map((name, i) => ({
                id: String(i + 1).repeat(24),
                hash: "a".repeat(64),
                name,
                sections: 1,
              })),
            },
          ],
        },
        warnings: [],
      },
    }),
  );
  await page.goto("/nexus");
  await page.getByRole("button", { name: "Memory", exact: true }).click();
  const star = page.getByRole("button", {
    name: "Focus file star: Notes / One.md",
    exact: true,
  });
  await expect(star).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(star.locator("span")).toHaveCSS("visibility", "hidden");
  await star.focus();
  await expect(star.locator("span")).toHaveCSS("visibility", "visible");
  const other = page.getByRole("button", {
    name: "Focus file star: Notes / Two.md",
    exact: true,
  });
  await expect(other.locator("span")).toHaveCSS("visibility", "hidden");
  await page
    .getByRole("button", { name: "Show all file names", exact: true })
    .click();
  await expect(other.locator("span")).toHaveCSS("visibility", "visible");
  await page
    .getByRole("button", { name: "Hide extra file names", exact: true })
    .click();
  await expect(other.locator("span")).toHaveCSS("visibility", "hidden");
  const canvas = page.getByRole("img", {
    name: "Original animated spiral galaxy style with selectable file stars",
    exact: true,
  });
  await canvas.focus();
  for (let i = 0; i < 20; i++) await page.keyboard.press("ArrowUp");
  const frame = await canvas.evaluate((element: HTMLCanvasElement) =>
    element.toDataURL(),
  );
  await page.keyboard.press("ArrowUp");
  await expect
    .poll(() =>
      canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL()),
    )
    .not.toBe(frame);
  await page
    .getByRole("button", { name: "Fullscreen memory galaxy", exact: true })
    .click();
  const expanded = page.getByRole("dialog", {
    name: "memory galaxy expanded",
    exact: true,
  });
  await expect(expanded).toBeVisible();
  await expect(expanded.getByRole("status")).toContainText(
    "Expanded view remains available",
  );
  await expect(other.locator("span")).toHaveCSS("visibility", "hidden");
  await page.keyboard.press("Escape");
  await expect(expanded).toHaveCount(0);
});

test("Core, Galaxy and Graph direct fullscreen uses the browser API and closes cleanly", async ({
  page,
}) => {
  await page.goto("/");
  for (const mode of ["Core", "Galaxy", "Graph"]) {
    await page.getByRole("button", { name: mode, exact: true }).click();
    await page
      .getByRole("button", { name: `Fullscreen ${mode}`, exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          document.fullscreenElement?.getAttribute("aria-label"),
        ),
      )
      .toBe("Expanded agent hologram");
    await page
      .getByRole("button", { name: "Collapse hologram", exact: true })
      .click();
    await expect
      .poll(() => page.evaluate(() => !!document.fullscreenElement))
      .toBe(false);
  }
  await page.goto("/nexus");
  await page.getByRole("button", { name: "Memory", exact: true }).click();
  await page
    .getByRole("button", { name: "Fullscreen memory galaxy", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.fullscreenElement?.getAttribute("aria-label"),
      ),
    )
    .toBe("memory galaxy expanded");
  await page
    .getByRole("button", { name: "Close expanded memory galaxy", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(false);
});
