import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  addBrowseGrant,
  removeBrowseGrant,
} from "../scripts/storage-browse-lib.mjs";
import { fixtureRole } from "./helpers/access";

test("storage spiral navigates real drive-folder-file metadata without reading on focus and preserves expansion", async ({
  page,
  context,
}) => {
  const dir = process.env.GW_SYNC_TEST_ROOT!,
    settings = path.join(dir, "storage-browse.json");
  const saved = await fs.readFile(settings).catch(() => null);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "storage-galaxy-"));
  try {
    await fs.mkdir(path.join(root, "Pictures"));
    await fs.copyFile(
      "public/icons/nexus-192.png",
      path.join(root, "Pictures", "photo.png"),
    );
    await fs.writeFile(
      path.join(root, "Pictures", "unknown.bin"),
      "UNSUPPORTED",
    );
    await fs.writeFile(settings, JSON.stringify({ version: 1, grants: [] }));
    const [grant] = await addBrowseGrant(dir, {
      path: root,
      label: "Spiral drive",
      type: "drive",
    });
    await fixtureRole(context);
    const listingRequests: any[] = [];
    const originalRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().endsWith("/api/sync/files/browser"))
        listingRequests.push(request.postDataJSON());
      if (request.url().includes("/api/sync/files/resource"))
        originalRequests.push(request.url());
    });
    await page.goto("/nexus");
    await page.getByRole("button", { name: "Memory", exact: true }).click();
    await page
      .getByRole("button", { name: "Storage galaxy", exact: true })
      .click();
    const storage = page.getByRole("region", {
      name: "Storage galaxy navigator",
    });
    await expect(storage).toBeVisible();
    const rootStar = storage.getByRole("button", {
      name: "Focus drive star: This Nexus host / Spiral drive",
      exact: true,
    });
    await expect(rootStar).toHaveClass(/is-resource-drive/);
    const count = listingRequests.length;
    await rootStar.focus();
    await rootStar.press("Enter");
    await expect(
      storage.getByRole("region", { name: "Selected storage object" }),
    ).toContainText("Spiral drive");
    expect(listingRequests.length).toBe(count);
    expect(originalRequests).toEqual([]);
    await storage
      .getByRole("button", { name: "Enter drive", exact: true })
      .click();
    const folder = storage.getByRole("button", {
      name: "Focus folder star: Spiral drive / Pictures",
      exact: true,
    });
    await expect(folder).toHaveClass(/is-resource-folder/);
    await folder.click();
    await storage
      .getByRole("button", { name: "Enter folder", exact: true })
      .click();
    await storage
      .getByRole("button", {
        name: "Focus file star: Pictures / photo.png",
        exact: true,
      })
      .click();
    expect(originalRequests).toEqual([]);
    await page
      .getByRole("button", { name: "Expand memory galaxy", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Selected storage object" }),
    ).toContainText("photo.png");
    await page
      .getByRole("button", {
        name: "Close expanded memory galaxy",
        exact: true,
      })
      .click();
    await expect(
      storage.getByRole("region", { name: "Selected storage object" }),
    ).toContainText("photo.png");
    await storage
      .getByRole("button", { name: "Show file actions", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Open file preview",
      exact: true,
    });
    await expect(
      dialog.getByRole("heading", { name: "photo.png", exact: true }),
    ).toBeVisible();
    expect(originalRequests).toEqual([]);
    const popupPromise = page.waitForEvent("popup");
    await dialog
      .getByRole("link", { name: "Open picture", exact: true })
      .click();
    const popup = await popupPromise;
    await popup.waitForLoadState();
    expect(
      await popup
        .locator("img")
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    ).toBe(192);
    await popup.close();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await storage
      .getByRole("button", {
        name: "Focus file star: Pictures / unknown.bin",
        exact: true,
      })
      .click();
    await storage
      .getByRole("button", { name: "Show file actions", exact: true })
      .click();
    await expect(
      dialog.getByText(
        "No supported original view is available for this file or size.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(dialog.getByRole("link")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Back to parent folder", exact: true })
      .click();
    await expect(
      storage.getByRole("button", {
        name: "Focus folder star: Spiral drive / Pictures",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Selected folders", exact: true })
      .click();
    await removeBrowseGrant(dir, grant.id);
    await page
      .getByRole("button", { name: "Reload folder list", exact: true })
      .click();
    await expect(
      storage.getByRole("button", { name: /Spiral drive/ }),
    ).toHaveCount(0);
  } finally {
    if (saved) await fs.writeFile(settings, saved);
    else await fs.rm(settings, { force: true });
    await fs.rm(root, { recursive: true, force: true });
  }
});
