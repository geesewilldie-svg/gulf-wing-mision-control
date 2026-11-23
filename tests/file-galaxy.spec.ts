import { test, expect } from "@playwright/test";
import { fixtureRole } from "./helpers/access";
test("real file nodes read exact versions and remain usable when expanded", async ({
  page,
  context,
}) => {
  await fixtureRole(context, "controller");
  const id = "a".repeat(24),
    other = "b".repeat(24),
    hash = "c".repeat(64);
  const reads: any[] = [];
  let denyRead = false;
  await page.route("**/api/sync/files", (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const data = route.request().postDataJSON();
    if (data.action === "map")
      return route.fulfill({
        json: {
          map: {
            total: 2,
            withheld: 0,
            omitted: 0,
            folders: [
              {
                id: "root",
                label: "Notes",
                kind: "obsidian",
                files: [
                  {
                    id,
                    hash,
                    name: "Start.md",
                    sections: 2,
                    noteLinks: {
                      links: [{ id: other }],
                      unresolved: 0,
                      partial: false,
                    },
                  },
                  { id: other, hash, name: "Plan.md", sections: 1 },
                ],
              },
            ],
          },
          warnings: [],
        },
      });
    if (denyRead)
      return route.fulfill({
        status: 403,
        json: { error: "Controller access required" },
      });
    reads.push(data);
    return route.fulfill({
      json: {
        answer: `Verified indexed text part ${data.part}`,
        fileRead: {
          id: data.id,
          hash: data.hash,
          part: data.part,
          totalParts: 2,
        },
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Galaxy", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Real file galaxy" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Read indexed file:/ }),
  ).toHaveCount(2);
  await page
    .getByRole("button", { name: "Expand hologram", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Expanded agent hologram" });
  await dialog.screenshot({
    path: `artifacts/file-galaxy/${test.info().project.name}-initial.png`,
  });
  await dialog
    .getByRole("button", {
      name: "Read indexed file: Notes / Start.md",
      exact: true,
    })
    .click();
  await expect(
    dialog.getByRole("region", { name: "Indexed file viewer" }),
  ).toContainText("Verified indexed text part 1");
  await dialog.getByRole("button", { name: "Next part", exact: true }).click();
  await expect(
    dialog.getByRole("region", { name: "Indexed file viewer" }),
  ).toContainText("part 2");
  expect(reads).toEqual([
    { action: "read-indexed", id, hash, part: 1 },
    { action: "read-indexed", id, hash, part: 2 },
  ]);
  await dialog.screenshot({
    path: `artifacts/file-galaxy/${test.info().project.name}.png`,
  });
  const bounds = await dialog.boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await dialog.getByRole("button", { name: "Close file", exact: true }).click();
  denyRead = true;
  await dialog
    .getByRole("button", {
      name: "Read indexed file: Notes / Plan.md",
      exact: true,
    })
    .click();
  await expect(
    dialog.getByText(
      "Controller access is required. Private file view was cleared.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: /Read indexed file:/ }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("region", { name: "Indexed file viewer" }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
test("request globe expands independently and closes with Escape", async ({
  page,
  context,
}) => {
  await fixtureRole(context, "controller");
  await page.goto("/");
  await page
    .getByRole("button", { name: "Expand request globe", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "request globe expanded",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("img", {
      name: "Nexus request globe and provider connections",
    }),
  ).toBeVisible();
  await page.evaluate(() => {
    Element.prototype.requestFullscreen = () =>
      Promise.reject(new Error("Unavailable in fixture"));
  });
  await dialog
    .getByRole("button", { name: "Browser fullscreen", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText(
    "Expanded view remains available",
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Expand request globe", exact: true }),
  ).toBeFocused();
});
test("file map and indexed viewing remain controller-only and same-origin", async ({
  context,
}) => {
  const data = { action: "map" };
  expect(
    (await context.request.post("/api/sync/files", { data })).status(),
  ).toBe(401);
  await fixtureRole(context, "display");
  expect(
    (await context.request.post("/api/sync/files", { data })).status(),
  ).toBe(403);
  await fixtureRole(context, "controller");
  expect(
    (
      await context.request.post("/api/sync/files", {
        data,
        headers: { Origin: "https://foreign.example" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await context.request.post("/api/sync/files", {
        data: { action: "read-indexed", id: "C:/private/file", hash: "x" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (await context.request.post("/api/sync/files", { data })).status(),
  ).toBe(200);
});

test("Memory Galaxy is available on the shared Nexus surface for desktop and phone controllers", async ({
  page,
  context,
}) => {
  await fixtureRole(context, "controller");
  await page.route("**/api/sync/files", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          json: {
            map: { total: 0, withheld: 0, omitted: 0, folders: [] },
            warnings: [],
          },
        })
      : route.continue(),
  );
  await page.goto("/nexus");
  await page.getByRole("button", { name: "Memory", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Memory Galaxy", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Expand memory galaxy", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "memory galaxy expanded",
    exact: true,
  });
  await expect(
    dialog.getByRole("region", { name: "Real file galaxy", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText("0 file dots shown", { exact: false }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
