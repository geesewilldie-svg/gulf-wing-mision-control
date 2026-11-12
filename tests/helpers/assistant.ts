import type { Page } from "@playwright/test";
export async function openAssistant(page: Page) {
  const drawer = page.getByRole("complementary", {
    name: "Nexus personal assistant",
    exact: true,
  });
  if (!(await drawer.isVisible()))
    await page
      .getByRole("button", { name: /✦ Talk to Nexus|● Nexus · Voice active/ })
      .click();
}
export async function minimizeAssistant(page: Page) {
  const button = page.getByRole("button", {
    name: "Minimize Nexus assistant",
    exact: true,
  });
  if (await button.isVisible()) await button.click();
}
export async function nexusSection(page: Page, name: string) {
  await minimizeAssistant(page);
  await page
    .getByRole("navigation", { name: "Nexus sections", exact: true })
    .getByRole("button", { name, exact: true })
    .click();
}
