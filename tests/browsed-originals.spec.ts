import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  browseSelectedFolders,
  readBrowsedOriginal,
} from "../lib/server/folder-browser";
import {
  validateResourceBytes,
  resourceFormat,
} from "../lib/server/file-resource-format";
import { GET } from "../app/api/sync/files/resource/route";
import { token, COOKIE } from "../lib/server/sync-store";
import { fixtureRole } from "./helpers/access";
import type { BrowserRoots, FolderPage } from "../lib/folder-browser";

test("unindexed originals enforce versions, grants, formats and controller access", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nexus-resources-"));
  const previous = process.env.GW_SYNC_DATA_DIR;
  process.env.GW_SYNC_DATA_DIR = dir;
  const settings = {
    version: 1 as const,
    pairingHash: "a".repeat(64),
    signingSecret: "b".repeat(64),
  };
  try {
    const selected = path.join(dir, "selected");
    await fs.mkdir(selected);
    await fs.writeFile(
      path.join(dir, "sync-config.json"),
      JSON.stringify(settings),
    );
    const roots = {
      version: 1,
      roots: [
        {
          id: "a".repeat(24),
          label: "Pictures",
          kind: "folder",
          path: selected,
        },
      ],
    };
    await fs.writeFile(
      path.join(dir, "local-folders.json"),
      JSON.stringify(roots),
    );
    const png = await fs.readFile("public/icons/nexus-192.png");
    await fs.writeFile(path.join(selected, "photo.png"), png);
    await fs.writeFile(
      path.join(selected, "note.txt"),
      "<script>alert(1)</script>",
    );
    await fs.writeFile(path.join(selected, "bad.png"), "invalid");
    await fs.writeFile(path.join(selected, "active.html"), "<html>");
    const home = (await browseSelectedFolders({
      action: "roots",
    })) as BrowserRoots;
    const listing = (await browseSelectedFolders({
      action: "list",
      handle: home.roots[0].handle,
    })) as FolderPage;
    const handle = listing.entries.find((e) => e.name === "photo.png")!
      .original!.handle;
    expect(
      listing.entries.find((e) => e.name === "active.html")!.original,
    ).toBeUndefined();
    expect((await readBrowsedOriginal(handle, false)).data.equals(png)).toBe(
      true,
    );
    const request = (
      role?: "controller" | "display",
      extra: Record<string, string> = {},
    ) =>
      new Request(
        "http://localhost/api/sync/files/resource?handle=" +
          encodeURIComponent(handle),
        {
          headers: {
            ...(role ? { cookie: COOKIE + "=" + token(settings, role) } : {}),
            ...extra,
          },
        },
      );
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request("display"))).status).toBe(403);
    expect(
      (await GET(request("controller", { "sec-fetch-site": "same-site" })))
        .status,
    ).toBe(403);
    const response = await GET(request("controller"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await response.arrayBuffer()).equals(png)).toBe(true);
    await expect(
      readBrowsedOriginal(
        listing.entries.find((e) => e.name === "bad.png")!.original!.handle,
        false,
      ),
    ).rejects.toMatchObject({ status: 415 });
    const textHandle = listing.entries.find((e) => e.name === "note.txt")!
      .original!.handle;
    const textResponse = await GET(
      new Request(
        "http://localhost/api/sync/files/resource?handle=" +
          encodeURIComponent(textHandle),
        { headers: { cookie: COOKIE + "=" + token(settings, "controller") } },
      ),
    );
    expect(textResponse.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8",
    );
    expect(textResponse.headers.get("cache-control")).toBe("no-store, private");
    expect(await textResponse.text()).toBe("<script>alert(1)</script>");
    const downloaded = await GET(
      new Request(
        "http://localhost/api/sync/files/resource?handle=" +
          encodeURIComponent(handle) +
          "&download=1",
        { headers: { cookie: COOKIE + "=" + token(settings, "controller") } },
      ),
    );
    expect(downloaded.headers.get("content-disposition")).toMatch(
      /^attachment/,
    );
    await expect(
      readBrowsedOriginal(home.roots[0].handle!, false),
    ).rejects.toMatchObject({ status: 410 });
    const [payload, signature] = handle.split(".");
    const tampered =
      payload + "." + (signature[0] === "a" ? "b" : "a") + signature.slice(1);
    await expect(readBrowsedOriginal(tampered, false)).rejects.toThrow();
    await fs.writeFile(
      path.join(selected, "photo.png"),
      Buffer.concat([png, Buffer.from("changed")]),
    );
    await expect(readBrowsedOriginal(handle, false)).rejects.toMatchObject({
      status: 409,
    });
    await fs.writeFile(
      path.join(dir, "local-folders.json"),
      JSON.stringify({ version: 1, roots: [] }),
    );
    await expect(readBrowsedOriginal(handle, false)).rejects.toMatchObject({
      status: 409,
    });
    expect(resourceFormat("photo.png", "obsidian")).toBeNull();
    expect(resourceFormat("note.md", "obsidian")?.view).toBe("document");
    const huge = Buffer.from(png);
    huge.writeUInt32BE(20000, 16);
    expect(() => validateResourceBytes(huge, ".png", false)).toThrow();
    expect(() => validateResourceBytes(huge, ".png", true)).not.toThrow();
    await expect(
      fs.access(path.join(dir, "local-file-index.json")),
    ).rejects.toThrow();
  } finally {
    if (previous === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = previous;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("paired browser renders a real unindexed PNG from the selected host folder", async ({
  page,
  context,
}) => {
  const root = process.env.GW_SYNC_TEST_ROOT!;
  const configPath = path.join(root, "local-folders.json");
  const saved = await fs.readFile(configPath).catch(() => null);
  const selected = await fs.mkdtemp(
    path.join(os.tmpdir(), "nexus-picture-ui-"),
  );
  try {
    await fs.copyFile(
      "public/icons/nexus-192.png",
      path.join(selected, "photo.png"),
    );
    await fs.writeFile(
      configPath,
      JSON.stringify({
        version: 1,
        roots: [
          {
            id: "c".repeat(24),
            label: "Picture fixture",
            kind: "folder",
            path: selected,
          },
        ],
      }),
    );
    await fixtureRole(context);
    await page.goto("/nexus");
    await page.getByRole("button", { name: "Memory", exact: true }).click();
    await page.getByText("Explore selected folders", { exact: true }).click();
    await page
      .getByRole("button", { name: "Open selected folder Picture fixture" })
      .click();
    await expect(
      page.getByText("No saved preview", { exact: true }),
    ).toBeVisible();
    const popupPromise = page.waitForEvent("popup");
    await page.getByRole("link", { name: "Open picture", exact: true }).click();
    const picture = await popupPromise;
    await picture.waitForLoadState();
    await expect(picture.locator("img")).toBeVisible();
    expect(
      await picture
        .locator("img")
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    ).toBe(192);
    await picture.close();
  } finally {
    if (saved) await fs.writeFile(configPath, saved);
    else await fs.rm(configPath, { force: true });
    await fs.rm(selected, { recursive: true, force: true });
  }
});
