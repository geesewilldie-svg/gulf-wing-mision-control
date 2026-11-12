import {
  openAssistant,
  minimizeAssistant,
  nexusSection,
} from "./helpers/assistant";
import { test, expect } from "@playwright/test";
import { fixtureRole } from "./helpers/access";

test.beforeEach(async ({ context, page }) => {
  await fixtureRole(context);
  await page.route("**/api/sync/nexus", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({
          json: { sections: 3, sources: [], localModel: true, providers: [] },
        })
      : route.fulfill({
          json: { engine: "Fixture", answer: "Your saved answer", sources: [] },
        }),
  );
});

test("one assistant preserves drafts and answers across management routes and minimization", async ({
  page,
}) => {
  await page.goto("/nexus");
  await expect(
    page.getByRole("heading", { name: "What needs your attention?" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Talk to Nexus", exact: true })
    .click();
  const assistant = page.getByRole("complementary", {
    name: "Nexus personal assistant",
    exact: true,
  });
  await assistant
    .getByLabel("Ask Nexus", { exact: true })
    .fill("Keep this draft");
  await nexusSection(page, "Connections");
  await openAssistant(page);
  await expect(assistant.getByLabel("Ask Nexus", { exact: true })).toHaveValue(
    "Keep this draft",
  );
  await minimizeAssistant(page);
  await page
    .getByRole("link", { name: "← Mission Control", exact: true })
    .click();
  await openAssistant(page);
  await expect(page).toHaveURL(/\/$/);
  await expect(assistant.getByLabel("Ask Nexus", { exact: true })).toHaveValue(
    "Keep this draft",
  );
  await assistant
    .getByRole("button", { name: "Ask Nexus", exact: true })
    .click();
  await expect(assistant).toContainText("Your saved answer");
  await assistant
    .getByRole("button", { name: "Minimize Nexus assistant", exact: true })
    .click();
  await expect(assistant).not.toBeVisible();
  await page.getByRole("button", { name: /✦ Talk to Nexus/ }).click();
  await expect(assistant).toContainText("Your saved answer");
  await expect(page.locator(".nexus-conversation")).toHaveCount(1);
});

test("connections expose one focused category and overview stays free of setup forms", async ({
  page,
}) => {
  await page.goto("/nexus");
  await expect(
    page.getByRole("heading", { name: "Google Calendar", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Google Calendar", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", {
      name: "Laptop files and Obsidian",
      exact: true,
    }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Laptop files", exact: true }).click();
  await expect(
    page.getByRole("region", {
      name: "Laptop files and Obsidian",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Google Calendar", exact: true }),
  ).not.toBeVisible();
  await page
    .getByRole("button", { name: "Device access", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Laptop maintenance", exact: true }),
  ).toBeVisible();
});

test("presentation has no assistant controls and mobile shell fits the viewport", async ({
  page,
}) => {
  await page.goto("/display");
  await expect(page.getByRole("button", { name: /Talk to Nexus/ })).toHaveCount(
    0,
  );
  await page.goto("/nexus");
  await page
    .getByRole("button", { name: "Talk to Nexus", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: `artifacts/nexus-ui/assistant-${test.info().project.name}.png`,
  });
});

test("losing controller access clears private assistant content", async ({
  page,
  context,
}) => {
  await page.goto("/nexus");
  await openAssistant(page);
  const assistant = page.getByRole("complementary", {
    name: "Nexus personal assistant",
    exact: true,
  });
  await assistant
    .getByLabel("Ask Nexus", { exact: true })
    .fill("Private request");
  await expect(
    assistant.getByRole("button", { name: "Ask Nexus", exact: true }),
  ).toBeEnabled();
  await assistant
    .getByRole("button", { name: "Ask Nexus", exact: true })
    .click();
  await expect(assistant).toContainText("Your saved answer");
  await context.clearCookies();
  await expect(
    assistant.getByRole("button", { name: "Ask Nexus", exact: true }),
  ).toBeDisabled({ timeout: 10000 });
  await expect(assistant).not.toContainText("Your saved answer");
  await expect(assistant.getByLabel("Ask Nexus", { exact: true })).toHaveValue(
    "",
  );
});
