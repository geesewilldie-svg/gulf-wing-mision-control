import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHmac } from "node:crypto";
import { browseSelectedFolders } from "../lib/server/folder-browser";
import { refreshFiles } from "../lib/server/local-files";
import { POST } from "../app/api/sync/files/browser/route";
import { token } from "../lib/server/sync-store";
import { fixtureRole } from "./helpers/access";
import type { BrowserRoots, FolderPage } from "../lib/folder-browser";
async function fixture(
  run: (
    dir: string,
    selected: string,
    config: { version: 1; pairingHash: string; signingSecret: string },
  ) => Promise<void>,
) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nexus-folder-browser-"));
  const previous = process.env.GW_SYNC_DATA_DIR;
  process.env.GW_SYNC_DATA_DIR = dir;
  const config = {
    version: 1 as const,
    pairingHash: "a".repeat(64),
    signingSecret: "b".repeat(64),
  };
  try {
    const selected = path.join(dir, "selected");
    await fs.mkdir(selected);
    await fs.writeFile(
      path.join(dir, "sync-config.json"),
      JSON.stringify(config),
    );
    await fs.writeFile(
      path.join(dir, "local-folders.json"),
      JSON.stringify({
        version: 1,
        roots: [
          {
            id: "a".repeat(24),
            label: "Selected documents",
            kind: "folder",
            path: selected,
          },
        ],
      }),
    );
    await run(dir, selected, config);
  } finally {
    if (previous === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = previous;
    await fs.rm(dir, { recursive: true, force: true });
  }
}
const roots = () =>
  browseSelectedFolders({ action: "roots" }) as Promise<BrowserRoots>;
const list = (handle: string, cursor?: string | null) =>
  browseSelectedFolders({
    action: "list",
    handle,
    cursor,
  }) as Promise<FolderPage>;

test("metadata browsing works without an index, hides private/link entries and paginates with real parent identities", async () =>
  fixture(async (dir, selected) => {
    await fs.mkdir(path.join(selected, "Pictures"));
    await fs.writeFile(
      path.join(selected, "Pictures", "sample.jpg"),
      "NOT_READ_AS_IMAGE_CONTENT",
    );
    await fs.writeFile(
      path.join(selected, "credentials.txt"),
      "PRIVATE_SECRET",
    );
    await fs.mkdir(path.join(selected, ".hidden"));
    await fs.symlink(path.join(dir), path.join(selected, "Redirect"), "dir");
    await Promise.all(
      Array.from({ length: 56 }, (_, i) =>
        fs.writeFile(
          path.join(selected, `item-${String(i).padStart(2, "0")}.jpg`),
          "UNINDEXED_CONTENT",
        ),
      ),
    );
    const big = await fs.open(path.join(selected, "Large.pdf"), "w");
    await big.truncate(3_000_000);
    await big.close();
    const home = await roots();
    expect(home.roots).toHaveLength(1);
    expect(JSON.stringify(home)).not.toContain(dir);
    const first = await list(home.roots[0].handle!);
    expect(first.location.id).toBe(home.roots[0].id);
    expect(first.location.parentId).toBeNull();
    expect(first.entries).toHaveLength(50);
    expect(first.nextCursor).toBeTruthy();
    expect(first.omitted).toBe(3);
    expect(
      first.entries.find((entry) => entry.name === "Pictures")?.handle,
    ).toBeTruthy();
    const second = await list(home.roots[0].handle!, first.nextCursor);
    expect(
      [...first.entries, ...second.entries].some(
        (entry) => entry.name === "Large.pdf" && entry.size === 3_000_000,
      ),
    ).toBe(true);

    expect(
      new Set([...first.entries, ...second.entries].map((entry) => entry.id))
        .size,
    ).toBe(first.visible);
    expect(
      [...first.entries, ...second.entries].some((entry) =>
        /credentials|hidden|Redirect/.test(entry.name),
      ),
    ).toBe(false);
    expect(JSON.stringify(first)).not.toContain("UNINDEXED_CONTENT");
    expect(JSON.stringify(first)).not.toContain(dir);
    const pictures = first.entries.find((entry) => entry.name === "Pictures")!;
    const child = await list(pictures.handle!);
    expect(child.location.parentId).toBe(first.location.id);
    expect(child.entries[0]).toMatchObject({
      name: "sample.jpg",
      kind: "file",
    });
    expect(child.entries[0].indexed).toBeUndefined();
    await expect(
      fs.stat(path.join(dir, "local-file-index.json")),
    ).rejects.toThrow();
    await fs.writeFile(path.join(selected, "new-file.txt"), "changed listing");
    await expect(list(home.roots[0].handle!, first.nextCursor)).rejects.toThrow(
      "listing changed",
    );
  }));

test("folder handles reject tampering, expiry, path inputs, replaced directories and revoked selection", async () =>
  fixture(async (dir, selected, config) => {
    await fs.mkdir(path.join(selected, "Child"));
    const home = await roots(),
      handle = home.roots[0].handle!;
    const parts = handle.split(".");
    const tampered =
      parts[0] + "." + (parts[1][0] === "A" ? "B" : "A") + parts[1].slice(1);
    await expect(list(tampered)).rejects.toThrow("invalid");
    await expect(
      browseSelectedFolders({ action: "list", handle, path: "../../" }),
    ).rejects.toThrow("paths are not accepted");
    const value = JSON.parse(
      Buffer.from(parts[0], "base64url").toString("utf8"),
    );
    value.expires = Date.now() - 1;
    const expired = Buffer.from(JSON.stringify(value)).toString("base64url");
    const signature = createHmac("sha256", config.signingSecret)
      .update("nexus-folder-v1." + expired)
      .digest("base64url");
    await expect(list(expired + "." + signature)).rejects.toThrow("expired");
    const page = await list(handle),
      child = page.entries[0];
    await fs.rename(
      path.join(selected, "Child"),
      path.join(selected, "OldChild"),
    );
    await fs.mkdir(path.join(selected, "Child"));
    await expect(list(child.handle!)).rejects.toThrow("identity changed");
    await fs.writeFile(
      path.join(dir, "local-folders.json"),
      JSON.stringify({ version: 1, roots: [] }),
    );
    await expect(list(handle)).rejects.toThrow("Selected folders changed");
  }));

test("cached previews are references only and directory scans disclose their cap", async () =>
  fixture(async (_dir, selected) => {
    await fs.writeFile(
      path.join(selected, "Preview.md"),
      "PRIVATE_SOURCE_CONTENT",
    );
    await refreshFiles();
    const home = await roots();
    const page = await list(home.roots[0].handle!);
    expect(page.entries[0].indexed?.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(page)).not.toContain("PRIVATE_SOURCE_CONTENT");
    await Promise.all(
      Array.from({ length: 1002 }, (_, i) =>
        fs.writeFile(path.join(selected, `extra-${i}.jpg`), ""),
      ),
    );
    const capped = await list(home.roots[0].handle!);
    expect(capped.limited).toBe(true);
    expect(capped.inspected).toBe(1000);
    expect(capped.entries.length).toBeLessThanOrEqual(50);
  }));

test("folder API requires controller and same origin and starts no provider", async () =>
  fixture(async (_dir, _selected, config) => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      throw Error("No provider allowed");
    }) as typeof fetch;
    try {
      const ask = (
        role?: "controller" | "display",
        origin = "http://localhost:3000",
      ) =>
        POST(
          new Request("http://localhost:3000/api/sync/files/browser", {
            method: "POST",
            headers: {
              host: "localhost:3000",
              origin,
              "content-type": "application/json",
              ...(role
                ? { cookie: "gw_sync_session=" + token(config, role) }
                : {}),
            },
            body: JSON.stringify({ action: "roots" }),
          }),
        );
      expect((await ask()).status).toBe(401);
      expect((await ask("display")).status).toBe(403);
      expect((await ask("controller", "https://other.example")).status).toBe(
        403,
      );
      const allowed = await ask("controller");
      expect(allowed.status).toBe(200);
      expect((await allowed.json()).roots).toHaveLength(1);
      expect(calls).toBe(0);
    } finally {
      globalThis.fetch = original;
    }
  }));

test("desktop and phone browse folders lazily, use breadcrumbs and open a checked indexed preview", async ({
  page,
  context,
}) => {
  await fixtureRole(context, "controller");
  const requests: any[] = [];
  let denied = false;
  await page.route("**/api/sync/files/browser", async (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    if (denied)
      return route.fulfill({
        status: 403,
        json: { error: "Controller access required" },
      });
    if (body.action === "roots")
      return route.fulfill({
        json: {
          host: { id: "host", label: "This Nexus host" },
          roots: [
            {
              id: "home",
              rootId: "a".repeat(24),
              name: "Knowledge",
              kind: "obsidian",
              available: true,
              handle: "root-handle",
            },
          ],
        },
      });
    const child = body.handle === "child-handle";
    return route.fulfill({
      json: {
        location: {
          id: child ? "child" : "home",
          rootId: "a".repeat(24),
          rootLabel: "Knowledge",
          name: child ? "Notes" : "Knowledge",
          relativeName: child ? "Notes" : "",
          parentId: child ? "home" : null,
        },
        entries: child
          ? [
              {
                id: "b".repeat(24),
                name: "Preview.md",
                relativeName: "Notes/Preview.md",
                kind: "file",
                size: 32,
                modifiedAt: new Date().toISOString(),
                indexed: {
                  id: "b".repeat(24),
                  hash: "c".repeat(64),
                  sections: 1,
                },
              },
              {
                id: "unindexed",
                name: "Picture.jpg",
                relativeName: "Notes/Picture.jpg",
                kind: "file",
                size: 100,
                modifiedAt: new Date().toISOString(),
              },
            ]
          : [
              {
                id: "child",
                name: "Notes",
                relativeName: "Notes",
                kind: "folder",
                size: null,
                modifiedAt: new Date().toISOString(),
                handle: "child-handle",
              },
            ],
        inspected: child ? 2 : 1,
        omitted: 0,
        visible: child ? 2 : 1,
        limited: false,
        nextCursor: null,
      },
    });
  });
  await page.route("**/api/sync/files", async (route) => {
    const body = route.request().postDataJSON();
    return route.fulfill({
      json:
        body.action === "map"
          ? {
              map: { total: 0, withheld: 0, omitted: 0, folders: [] },
              warnings: [],
            }
          : {
              answer: "Current indexed preview fixture",
              fileRead: {
                id: body.id,
                hash: body.hash,
                part: 1,
                totalParts: 1,
              },
            },
    });
  });
  await page.goto("/nexus");
  await page.getByRole("button", { name: "Memory", exact: true }).click();
  expect(requests).toEqual([]);
  await page.getByText("Explore selected folders", { exact: true }).click();
  const browser = page.getByRole("region", {
    name: "Selected folder explorer",
  });
  await browser
    .getByRole("button", {
      name: "Open selected folder Knowledge",
      exact: true,
    })
    .click();
  await browser
    .getByRole("button", { name: "Open folder Notes", exact: true })
    .click();
  await expect(browser).toContainText("Picture.jpg");
  await expect(browser).toContainText("No saved preview");
  await browser
    .getByRole("button", { name: "Read indexed file Preview.md", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Indexed file viewer" }),
  ).toContainText("Current indexed preview fixture");
  await page.getByRole("button", { name: "Close file", exact: true }).click();
  await browser
    .getByRole("button", { name: "Back to parent folder", exact: true })
    .click();
  await expect(
    browser.getByRole("button", { name: "Open folder Notes", exact: true }),
  ).toBeVisible();
  expect(requests.every((request) => !Object.hasOwn(request, "path"))).toBe(
    true,
  );
  denied = true;
  await browser
    .getByRole("button", { name: "Reload folder list", exact: true })
    .click();
  await expect(browser).not.toContainText("Knowledge");
  await expect(
    browser.getByRole("button", { name: "Open folder Notes", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      "Controller access is required. Private file view was cleared.",
      { exact: true },
    ),
  ).toBeVisible();
});
