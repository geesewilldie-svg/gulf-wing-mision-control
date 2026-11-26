import { test, expect } from "@playwright/test";
import { fixtureRole } from "./helpers/access";

test("Nexus sections keep readable cards, fields and separated touch targets", async ({
  page,
  context,
}, testInfo) => {
  await fixtureRole(context);
  await page.goto("/nexus");
  for (const name of [
    "Overview",
    "Daily brief",
    "Co-hosting",
    "Marketing",
    "Foundation",
    "Memory",
    "Knowledge",
    "Connections",
    "Gemini Public",
  ]) {
    await page
      .getByRole("navigation", { name: "Nexus sections" })
      .getByRole("button", { name, exact: true })
      .click();
    if (name === "Foundation")
      await expect(
        page.getByRole("heading", { name: "Owner policy", exact: true }),
      ).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Nexus sections" });
    const boxes = await nav.getByRole("button").evaluateAll((nodes) =>
      nodes.map((node) => {
        const r = node.getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          right: r.right,
          bottom: r.bottom,
          height: r.height,
        };
      }),
    );
    for (const box of boxes) expect(box.height).toBeGreaterThanOrEqual(44);
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i],
          b = boxes[j];
        expect(
          a.right + 7 <= b.x ||
            b.right + 7 <= a.x ||
            a.bottom + 7 <= b.y ||
            b.bottom + 7 <= a.y,
        ).toBeTruthy();
      }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBeTruthy();
    if (name === "Connections" || name === "Foundation") {
      const rows = page.locator(".nexus-actions");
      expect(await rows.count()).toBeGreaterThan(0);
      for (const row of await rows.all()) {
        if (!(await row.isVisible())) continue;
        const children = await row
          .locator(":scope > button")
          .evaluateAll((nodes) =>
            nodes.map((n) => {
              const r = n.getBoundingClientRect();
              return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
            }),
          );
        for (let i = 1; i < children.length; i++) {
          const a = children[i - 1],
            b = children[i];
          expect(b.x - a.right >= 11 || b.y - a.bottom >= 11).toBeTruthy();
        }
      }
    }
    await page.screenshot({
      path: `artifacts/spacing/${testInfo.project.name}-${name.replaceAll(" ", "-")}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await expect(
      page.getByRole("navigation", { name: "Nexus sections" }),
    ).toBeVisible();
  }
});

test("expanded REA controls and assistant remain separated", async ({
  page,
  context,
}, testInfo) => {
  await fixtureRole(context);
  await page.goto("/nexus");
  await page.getByText("Connection activity", { exact: true }).click();
  await page.getByText("REA inspection prerequisites", { exact: true }).click();
  const detail = page
    .locator("details")
    .filter({
      has: page.locator("summary", { hasText: "REA inspection prerequisites" }),
    })
    .last();
  const gaps = await detail.locator(":scope > button").evaluateAll((nodes) =>
    nodes.map((n) => {
      const r = n.getBoundingClientRect();
      const previous = n.previousElementSibling?.getBoundingClientRect();
      return { height: r.height, gap: previous ? r.top - previous.bottom : 0 };
    }),
  );
  expect(gaps.length).toBe(3);
  for (const control of gaps) {
    expect(control.height).toBeGreaterThanOrEqual(44);
    expect(control.gap).toBeGreaterThanOrEqual(12);
  }
  await detail.screenshot({
    path: `artifacts/spacing/${testInfo.project.name}-rea-expanded.png`,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "✦ Talk to Nexus", exact: true })
    .click();
  const drawer = page.locator(".nexus-assistant-drawer");
  await expect(drawer).toBeVisible();
  expect(
    await drawer.evaluate((n) => n.scrollWidth <= n.clientWidth + 1),
  ).toBeTruthy();
  await page.screenshot({
    path: `artifacts/spacing/${testInfo.project.name}-assistant.png`,
    animations: "disabled",
  });
});
