import { test, expect } from "@playwright/test";
import { fixtureRole } from "./helpers/access";
import { openAssistant } from "./helpers/assistant";
import { mkdir } from "node:fs/promises";
test("saved draft cards keep long names and actions separate at desktop and phone widths", async ({
  page,
  context,
}, info) => {
  await fixtureRole(context, "controller");
  const titles = [
    "Nexus draft revised revised revised — Gulf Wing business plan and operating notes",
    "Nexus draft",
  ];
  const drafts = titles.map((title, index) => ({
    id: String(index + 1).repeat(32),
    title,
    bytes: 65,
    scope: "Personal",
    hash: "a".repeat(64),
  }));
  await page.route("**/api/sync/drafts**", (route) => {
    const url = new URL(route.request().url()),
      id = url.searchParams.get("id");
    return route.fulfill({
      json: id
        ? {
            draft: {
              ...drafts.find((draft) => draft.id === id),
              text: "Saved example file text.",
              verifiedBytes: 24,
              recordedBytes: 65,
              sizeWarning: "Fixture size mismatch.",
            },
          }
        : { drafts },
    });
  });
  await page.goto("/nexus");
  await openAssistant(page);
  const panel = page.getByRole("region", { name: "Draft files", exact: true });
  await panel
    .getByRole("button", { name: "Show saved files", exact: true })
    .click();
  await expect(
    panel.getByText(titles[0], { exact: false }).first(),
  ).toBeVisible();
  await mkdir("artifacts/draft-ui", { recursive: true });
  await panel.scrollIntoViewIfNeeded();
  if (process.env.GW_DRAFT_LAYOUT_BEFORE) {
    await page.screenshot({
      path: `artifacts/draft-ui/before-${info.project.name}.png`,
    });
    return;
  }
  const cards = panel.locator(".nexus-draft-file");
  await expect(cards).toHaveCount(2);
  const first = cards.first();
  for (const label of ["View text", "Edit a copy"])
    await expect(
      first.getByRole("button", { name: label, exact: true }),
    ).toBeVisible();
  await expect(
    first.getByRole("link", { name: "Download", exact: true }),
  ).toBeVisible();
  const title = await first.locator("h4").boundingBox(),
    actions = await first.locator(".nexus-draft-actions").boundingBox();
  expect(actions!.y).toBeGreaterThanOrEqual(title!.y + title!.height + 8);
  const controls = await first.locator(".nexus-draft-actions > *").all();
  for (let i = 1; i < controls.length; i++) {
    const previous = await controls[i - 1].boundingBox(),
      current = await controls[i].boundingBox();
    expect(current!.y).toBeGreaterThanOrEqual(
      previous!.y + previous!.height + 8,
    );
  }
  expect(
    await panel.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `artifacts/draft-ui/after-${info.project.name}.png`,
  });
  if (info.project.name === "mobile") {
    await page.setViewportSize({ width: 320, height: 800 });
    expect(
      await panel.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
  }
  await first.getByRole("button", { name: "Edit a copy", exact: true }).click();
  await expect(
    panel.getByRole("textbox", { name: "File text", exact: true }),
  ).toBeFocused();
  await page.screenshot({
    path: `artifacts/draft-ui/editor-${info.project.name}.png`,
  });
});
