import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fixtureRole, fixtureCookie } from "./helpers/access";
import {
  beginGoogle,
  finishGoogle,
  googleAccounts,
  GOOGLE_SCOPE,
  DRIVE_SCOPE,
} from "../lib/server/google-accounts";
import { selectDriveFile, refreshDrive } from "../lib/server/google-drive";
const names = [
  "google-oauth.json",
  "google-tokens.json",
  "google-state.json",
  "google-tokens-v1.backup.json",
  "google-drive-selected.json",
  "google-drive-index.json",
];
async function clean() {
  await Promise.all(
    names.map((name) =>
      fs.rm(path.join(process.env.GW_SYNC_TEST_ROOT!, name), { force: true }),
    ),
  );
}
async function seed(drive = true) {
  const old = process.env.GW_SYNC_DATA_DIR;
  process.env.GW_SYNC_DATA_DIR = process.env.GW_SYNC_TEST_ROOT!;
  try {
    await clean();
    await fs.writeFile(
      path.join(process.env.GW_SYNC_TEST_ROOT!, "google-oauth.json"),
      JSON.stringify({
        clientId: "synthetic.apps.googleusercontent.com",
        clientSecret: "synthetic-private",
      }),
    );
    for (const email of ["first@example.test", "second@example.test"]) {
      const start = await beginGoogle(drive ? "both" : "calendar"),
        scope = new URL(start.url).searchParams.get("scope")!;
      await finishGoogle(start.state, start.state, "synthetic", (async (
        u: any,
      ) =>
        String(u).includes("/token")
          ? Response.json({
              access_token: "synthetic-" + email,
              refresh_token: "synthetic-refresh",
              scope,
              expires_in: 3600,
            })
          : Response.json({ email, email_verified: true })) as typeof fetch);
    }
    const accounts = await googleAccounts();
    if (drive) {
      const transport = (async (u: any) =>
        String(u).includes("/export")
          ? new Response(
              "Auroradrivepilot business evidence from a selected Google Doc.",
            )
          : Response.json({
              id: "document123456789",
              name: "Pilot Google Doc",
              mimeType: "application/vnd.google-apps.document",
              modifiedTime: "2026-11-09T12:00:00Z",
            })) as typeof fetch;
      await selectDriveFile(accounts[0].id, "document123456789", transport);
      await refreshDrive(transport);
    }
    return accounts;
  } finally {
    if (old === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = old;
  }
}
test("controller searches selected Google snapshots in the browser and Ask Nexus, then removes cached access", async ({
  page,
  context,
}) => {
  await seed();
  try {
    await fixtureRole(context);
    await page.goto("/nexus");
    await page
      .getByRole("button", { name: "Connections", exact: true })
      .click();
    const panel = page.getByRole("region", {
      name: "Google Drive Docs and Sheets",
    });
    await expect(panel.getByLabel("Drive account")).toContainText(
      "first@example.test",
    );
    await expect(panel.getByLabel("Drive account")).toContainText(
      "second@example.test",
    );
    await expect(
      panel.getByText(/1 selected files · 1 readable cached files/),
    ).toBeVisible();
    await panel
      .getByLabel("Search saved Google text", { exact: true })
      .fill("Auroradrivepilot");
    await panel
      .getByRole("button", { name: "Search saved Google text", exact: true })
      .click();
    await expect(
      panel.getByText(
        "Auroradrivepilot business evidence from a selected Google Doc.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      panel.getByRole("link", { name: "Open source in Google" }),
    ).toHaveAttribute(
      "href",
      "https://docs.google.com/document/d/document123456789/edit",
    );
    const answer = await context.request.post("/api/sync/nexus", {
      data: { query: "Auroradrivepilot", mode: "knowledge" },
    });
    expect(answer.status()).toBe(200);
    expect(
      (await answer.json()).sources.some((s: any) =>
        s.source.includes("Google Drive · first@example.test"),
      ),
    ).toBe(true);
    page.once("dialog", (d) => d.accept());
    await panel
      .getByRole("button", {
        name: "Remove Google selection · Pilot Google Doc",
        exact: true,
      })
      .click();
    await expect(
      panel.getByText(/0 selected files · 0 readable cached files/),
    ).toBeVisible();
  } finally {
    await clean();
  }
});
test("an existing Calendar account can request Drive access without losing Calendar scope", async ({
  page,
  context,
}) => {
  await seed(false);
  try {
    await context.addCookies([
      { ...fixtureCookie("controller"), domain: "localhost" },
    ]);
    let destination = "";
    await page.route("https://accounts.google.com/**", async (route) => {
      destination = route.request().url();
      await route.fulfill({
        contentType: "text/html",
        body: "<h1>Synthetic Workspace consent</h1>",
      });
    });
    await page.goto("http://localhost:3000/nexus");
    await page
      .getByRole("button", { name: "Connections", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Add Drive access · first@example.test",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "Synthetic Workspace consent" }),
    ).toBeVisible();
    const url = new URL(destination);
    expect(url.searchParams.get("scope")).toContain(GOOGLE_SCOPE);
    expect(url.searchParams.get("scope")).toContain(DRIVE_SCOPE);
    expect(url.searchParams.get("login_hint")).toBe("first@example.test");
  } finally {
    await clean();
  }
});
test("Drive routes reject display-only, unpaired, cross-origin and unsupported write operations", async ({
  context,
}) => {
  for (const role of ["display", null] as const) {
    if (role) await fixtureRole(context, role);
    else await context.clearCookies();
    expect((await context.request.get("/api/sync/google/drive")).status()).toBe(
      role ? 403 : 401,
    );
    expect(
      (
        await context.request.post("/api/sync/google/drive", {
          data: { action: "refresh" },
        })
      ).status(),
    ).toBe(role ? 403 : 401);
  }
  await fixtureRole(context);
  expect(
    (
      await context.request.post("/api/sync/google/drive", {
        data: { action: "refresh" },
        headers: { Origin: "https://external.example" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await context.request.post("/api/sync/google/drive", {
        data: { action: "delete", fileId: "document123456789" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await context.request.post("/api/sync/google/drive", {
        data: {
          action: "select",
          accountId: "a".repeat(24),
          fileId: "https://external.example",
        },
      })
    ).status(),
  ).toBe(400);
});
