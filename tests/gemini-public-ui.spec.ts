import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fixtureRole } from "./helpers/access";
import { writePublicConfig } from "../scripts/gemini-public-lib.mjs";
test("dedicated public form sends only its current question and resets confirmation", async ({
  page,
  context,
}) => {
  await fixtureRole(context);
  await page.route("**/api/sync/gemini-public", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: {
          configured: true,
          enabled: true,
          supported: true,
          policy: "public-only",
          model: "gemini-3.5-flash-lite",
          dailyLimit: 10,
        },
      });
    if (route.request().method() === "POST") {
      expect(route.request().postDataJSON()).toEqual({
        question: "Explain rainbows.",
        confirmedPublic: true,
      });
      return route.fulfill({
        json: {
          engine: "Gemini Public · synthetic",
          answer: "Rainbows result from light interacting with water droplets.",
          sources: [],
          policy: "public-only",
        },
      });
    }
    return route.fulfill({
      json: {
        configured: true,
        enabled: false,
        supported: true,
        policy: "public-only",
        dailyLimit: 10,
      },
    });
  });
  await page.goto("/nexus");
  await page
    .getByRole("button", { name: "Gemini Public", exact: true })
    .click();
  const panel = page.getByRole("region", { name: "Gemini Public questions" });
  await expect(panel).toContainText("human review");
  await expect(panel).toContainText("does not retrieve business files");
  await panel
    .getByLabel("Public question", { exact: true })
    .fill("Explain rainbows.");
  await expect(
    panel.getByRole("button", { name: "Ask Gemini Public", exact: true }),
  ).toBeDisabled();
  const confirm = panel.getByRole("checkbox");
  await confirm.check();
  await panel
    .getByRole("button", { name: "Ask Gemini Public", exact: true })
    .click();
  await expect(
    panel.getByRole("article", { name: "Gemini Public answer" }),
  ).toContainText("Rainbows result");
  await expect(confirm).not.toBeChecked();
  await page.getByRole("button", { name: "Ask Nexus", exact: true }).click();
  await expect(
    page.getByRole("article", { name: "Gemini Public answer" }),
  ).toHaveCount(0);
});
test("public route rejects unpaired, display, cross-site and extra private context, while main Gemini remains unavailable", async ({
  context,
}) => {
  const policy = path.join(
    process.env.GW_SYNC_TEST_ROOT!,
    "gemini-public.json",
  );
  try {
    await writePublicConfig(
      {
        version: 1,
        policy: "public-only",
        enabled: true,
        secretType: "windows-dpapi",
        protectedKey: "01000000" + "ab".repeat(100),
        model: "gemini-3.5-flash-lite",
        dailyLimit: 10,
      },
      process.env.GW_SYNC_TEST_ROOT!,
    );
    for (const role of ["display", null] as const) {
      if (role) await fixtureRole(context, role);
      else await context.clearCookies();
      expect(
        (await context.request.get("/api/sync/gemini-public")).status(),
      ).toBe(role ? 403 : 401);
      expect(
        (
          await context.request.post("/api/sync/gemini-public", {
            data: { question: "Public", confirmedPublic: true },
          })
        ).status(),
      ).toBe(role ? 403 : 401);
    }
    await fixtureRole(context);
    const status = await (
      await context.request.get("/api/sync/gemini-public")
    ).json();
    expect(JSON.stringify(status)).not.toContain("protectedKey");
    expect(
      (
        await context.request.post("/api/sync/gemini-public", {
          data: { question: "Public", confirmedPublic: true },
          headers: { Origin: "https://external.example" },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await context.request.post("/api/sync/gemini-public", {
          data: {
            question: "Public",
            confirmedPublic: true,
            history: ["PRIVATE_CANARY"],
          },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await context.request.post("/api/sync/nexus", {
          data: {
            query: "PRIVATE_CANARY business document",
            mode: "gemini",
            allowExternal: true,
          },
        })
      ).status(),
    ).toBe(403);
    const stopped = await context.request.delete("/api/sync/gemini-public");
    expect(stopped.status()).toBe(200);
    expect((await stopped.json()).enabled).toBe(false);
  } finally {
    await fs.rm(policy, { force: true });
  }
});
