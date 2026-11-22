import { test, expect } from "@playwright/test";
import { fixtureRole } from "./helpers/access";
import { openAssistant } from "./helpers/assistant";

test("a pending assistant reply preserves an open edited draft", async ({
  page,
  context,
}) => {
  await fixtureRole(context, "controller");
  let requests = 0,
    finishReply: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    finishReply = resolve;
  });
  await page.route("**/api/sync/nexus", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    requests++;
    if (requests === 2) await pending;
    return route.fulfill({
      json: {
        engine: "Synthetic fixture",
        answer: requests === 1 ? "Initial answer" : "New answer",
        sources: [],
      },
    });
  });
  try {
    await page.goto("/nexus");
    await openAssistant(page);
    const question = page
      .locator("form")
      .getByLabel("Ask Nexus", { exact: true });
    const submit = page
      .locator("form")
      .getByRole("button", { name: "Ask Nexus", exact: true });
    await question.fill("Initial question");
    await submit.click();
    const panel = page.getByRole("region", {
      name: "Draft files",
      exact: true,
    });
    await panel.getByRole("button", { name: "Save this answer" }).click();
    const editor = panel.getByRole("textbox", {
      name: "File text",
      exact: true,
    });
    await editor.fill("Owner's unsaved edits must survive a new reply.");
    await question.fill("Another question");
    await submit.click();
    await expect.poll(() => requests).toBe(2);
    await expect(editor).toHaveValue(
      "Owner's unsaved edits must survive a new reply.",
    );
    finishReply!();
    await expect(page.getByText("New answer", { exact: true })).toBeVisible();
    await expect(editor).toHaveValue(
      "Owner's unsaved edits must survive a new reply.",
    );
    await panel
      .getByRole("button", { name: "Cancel editing", exact: true })
      .click();
  } finally {
    finishReply!();
  }
});
