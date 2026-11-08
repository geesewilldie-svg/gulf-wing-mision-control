import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fixtureRole } from "./helpers/access";
import {
  beginGoogle,
  finishGoogle,
  DRIVE_SCOPE,
} from "../lib/server/google-accounts";
test("a controller can rebuild a corrupt Drive snapshot from the browser without reconnecting", async ({
  page,
  context,
}) => {
  const root = process.env.GW_SYNC_TEST_ROOT!,
    old = process.env.GW_SYNC_DATA_DIR;
  const names = [
    "google-oauth.json",
    "google-tokens.json",
    "google-state.json",
    "google-drive-selected.json",
    "google-drive-index.json",
  ];
  try {
    process.env.GW_SYNC_DATA_DIR = root;
    await fs.writeFile(
      path.join(root, "google-oauth.json"),
      JSON.stringify({
        clientId: "synthetic.apps.googleusercontent.com",
        clientSecret: "synthetic-private",
      }),
    );
    const start = await beginGoogle("drive");
    await finishGoogle(start.state, start.state, "synthetic", (async (
      u: any,
    ) =>
      String(u).includes("/token")
        ? Response.json({
            access_token: "synthetic",
            refresh_token: "synthetic",
            scope: DRIVE_SCOPE,
            expires_in: 3600,
          })
        : Response.json({
            email: "recovery@example.test",
            email_verified: true,
          })) as typeof fetch);
    await fs.writeFile(
      path.join(root, "google-drive-selected.json"),
      JSON.stringify({ version: 1, revision: 1, files: [] }),
    );
    await fs.writeFile(path.join(root, "google-drive-index.json"), "broken");
    if (old === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = old;
    await fixtureRole(context);
    await page.goto("/nexus");
    await page
      .getByRole("button", { name: "Connections", exact: true })
      .click();
    const panel = page.getByRole("region", {
      name: "Google Drive Docs and Sheets",
    });
    await expect(panel).toContainText("Drive snapshot could not be read");
    await expect(
      panel.getByRole("button", {
        name: "Refresh selected Drive files",
        exact: true,
      }),
    ).toBeEnabled();
    await panel
      .getByRole("button", {
        name: "Refresh selected Drive files",
        exact: true,
      })
      .click();
    await expect(
      panel.getByText(/0 selected files · 0 readable cached files/),
    ).toBeVisible();
    expect(
      JSON.parse(
        await fs.readFile(path.join(root, "google-drive-index.json"), "utf8"),
      ).entries,
    ).toEqual([]);
  } finally {
    if (old === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = old;
    await Promise.all(
      names.map((name) => fs.rm(path.join(root, name), { force: true })),
    );
  }
});
