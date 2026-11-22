import { test, expect } from "@playwright/test";
import { fixtureRole } from "./helpers/access";
import { openAssistant } from "./helpers/assistant";

test("recent operation selection retrieves saved status without submitting an execution request", async ({
  page,
  context,
}) => {
  await fixtureRole(context, "controller");
  const id = "c".repeat(24),
    queries: string[] = [];
  await page.route("**/api/sync/nexus", (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const query = route.request().postDataJSON().query;
    queries.push(query);
    return route.fulfill({
      json:
        query === "Show laptop operations"
          ? {
              engine: "Nexus laptop maintenance",
              answer: "Recent saved operations",
              sources: [],
              operationChoices: [{ id, label: "start-services: unknown" }],
            }
          : {
              engine: "Nexus laptop maintenance",
              answer:
                "Result: unknown. No final result was recorded; check current services.",
              sources: [],
              operationId: id,
            },
    });
  });
  await page.goto("/nexus");
  await openAssistant(page);
  await page
    .locator("form")
    .getByLabel("Ask Nexus", { exact: true })
    .fill("Show laptop operations");
  await page
    .locator("form")
    .getByRole("button", { name: "Ask Nexus", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Operation: start-services: unknown",
      exact: true,
    })
    .click();
  await expect(
    page.getByText(
      "Result: unknown. No final result was recorded; check current services.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(queries).toEqual([
    "Show laptop operations",
    `Show laptop operation ${id}`,
  ]);
});
