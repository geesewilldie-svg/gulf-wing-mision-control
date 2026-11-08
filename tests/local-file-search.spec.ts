import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fixtureRole } from "./helpers/access";
import { addFolder } from "../scripts/nexus-folders-lib.mjs";

test("controller refreshes selected folders, searches, previews, uses Ask Nexus and removes access", async ({
  page,
  context,
}) => {
  const folder = await fs.mkdtemp(
    path.join(os.tmpdir(), "nexus-file-browser-"),
  );
  const data = process.env.GW_SYNC_TEST_ROOT!;
  try {
    await fs.rm(path.join(data, "local-folders.json"), { force: true });
    await fs.rm(path.join(data, "local-file-index.json"), { force: true });
    await fs.writeFile(
      path.join(folder, "strategy.md"),
      "# Business strategy\nZirconpilot turnover revenue requires reviewing cleaning scope.",
    );
    await addFolder(folder, "folder", "Pilot documents", data);
    await fixtureRole(context);
    await page.goto("/nexus");
    await page
      .getByRole("button", { name: "Connections", exact: true })
      .click();
    const panel = page.getByRole("region", {
      name: "Laptop files and Obsidian",
      exact: true,
    });
    await panel
      .getByRole("button", { name: "Refresh file index", exact: true })
      .click();
    await expect(panel.getByText(/1 readable indexed files/)).toBeVisible();
    await panel
      .getByLabel("Search selected laptop files", { exact: true })
      .fill("Zirconpilot");
    await panel
      .getByRole("button", { name: "Search file index", exact: true })
      .click();
    await panel
      .getByRole("button", {
        name: "Preview source · Laptop · Pilot documents / strategy.md",
        exact: true,
      })
      .click();
    await expect(
      panel.getByRole("region", { name: "Local source preview" }),
    ).toContainText("Zirconpilot");
    const answer = await context.request.post("/api/sync/nexus", {
      data: { query: "Zirconpilot", mode: "knowledge" },
      headers: { Origin: "http://127.0.0.1:3000" },
    });
    expect(answer.status()).toBe(200);
    expect(
      (await answer.json()).sources.some((s: any) =>
        s.source.includes("Pilot documents"),
      ),
    ).toBe(true);
    await fs.writeFile(path.join(folder, "strategy.md"), "Changed content");
    const changed = await context.request.post("/api/sync/files", {
      data: { action: "search", query: "Zirconpilot" },
    });
    expect((await changed.json()).matches).toEqual([]);
    await page.reload();
    await page
      .getByRole("button", { name: "Connections", exact: true })
      .click();
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", {
        name: "Remove folder · Pilot documents",
        exact: true,
      })
      .click();
    await expect(
      page.getByText(/Folder removed and connected-file snapshot cleared/),
    ).toBeVisible();
    expect(await fs.readFile(path.join(folder, "strategy.md"), "utf8")).toBe(
      "Changed content",
    );
  } finally {
    await fs.rm(folder, { recursive: true, force: true });
    await fs.rm(path.join(data, "local-folders.json"), { force: true });
    await fs.rm(path.join(data, "local-file-index.json"), { force: true });
  }
});
test("folder routes reject display, unpaired, cross-site and arbitrary path operations", async ({
  context,
}) => {
  for (const role of ["display", null] as const) {
    if (role) await fixtureRole(context, role);
    else await context.clearCookies();
    expect((await context.request.get("/api/sync/files")).status()).toBe(
      role ? 403 : 401,
    );
    expect(
      (
        await context.request.post("/api/sync/files", {
          data: { action: "refresh" },
        })
      ).status(),
    ).toBe(role ? 403 : 401);
  }
  await fixtureRole(context);
  expect(
    (
      await context.request.post("/api/sync/files", {
        data: { action: "refresh" },
        headers: { Origin: "https://external.example" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await context.request.post("/api/sync/files", {
        data: { action: "add", path: "/etc" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await context.request.post("/api/sync/files", {
        data: { action: "preview", id: "../../etc/passwd" },
      })
    ).status(),
  ).toBe(404);
});
