import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  refreshFiles,
  fileSnapshot,
  connectedFileDocuments,
  removeFileRoot,
  permittedRelative,
} from "../lib/server/local-files";
import { addFolder } from "../scripts/nexus-folders-lib.mjs";

test.describe("local folder index", () => {
  let temp: string, folder: string, old: string | undefined;
  test.beforeEach(async () => {
    temp = await fs.mkdtemp(path.join(os.tmpdir(), "nexus-file-unit-"));
    folder = path.join(temp, "approved");
    await fs.mkdir(folder);
    old = process.env.GW_SYNC_DATA_DIR;
    process.env.GW_SYNC_DATA_DIR = path.join(temp, "private");
  });
  test.afterEach(async () => {
    if (old === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = old;
    await fs.rm(temp, { recursive: true, force: true });
  });
  test("indexes selected Markdown/text with stable IDs and keeps originals unchanged", async () => {
    await fs.writeFile(
      path.join(folder, "plan.md"),
      "# Revenue\nCapecoral turnover research.",
    );
    await fs.writeFile(path.join(folder, "budget.txt"), "Revenue and costs.");
    await addFolder(folder, "folder", "Business");
    const first = await refreshFiles();
    expect(first.status.files).toBe(2);
    expect(first.status.scannedAt).toBeTruthy();
    expect(first.files[0].documents[0].source).toContain("Laptop · Business /");
    const next = await refreshFiles();
    expect(next.files.map((f) => f.id).sort()).toEqual(
      first.files.map((f) => f.id).sort(),
    );
    expect(await fs.readFile(path.join(folder, "plan.md"), "utf8")).toBe(
      "# Revenue\nCapecoral turnover research.",
    );
    expect(JSON.stringify(next.status)).not.toContain(temp);
  });
  test("Obsidian indexes only Markdown; excludes hidden credentials applications and links", async () => {
    await fs.writeFile(path.join(folder, "note.md"), "Approved vault note");
    await fs.writeFile(
      path.join(folder, "ignore.txt"),
      "Not an Obsidian Markdown file",
    );
    await fs.writeFile(path.join(folder, ".secret.md"), "Hidden");
    await fs.writeFile(path.join(folder, "client_secret.txt"), "Secret");
    await fs.writeFile(path.join(folder, "credentials.md"), "Secret");
    await fs.mkdir(path.join(folder, "node_modules"));
    await fs.writeFile(
      path.join(folder, "node_modules", "secret.md"),
      "Secret",
    );
    const outside = path.join(temp, "outside");
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, "outside.md"), "Not permitted");
    await fs.symlink(outside, path.join(folder, "junction"), "dir");
    await fs.symlink(
      path.join(outside, "outside.md"),
      path.join(folder, "link.md"),
    );
    await addFolder(folder, "obsidian", "Vault");
    const scan = await refreshFiles();
    expect(scan.status.files).toBe(1);
    expect(scan.files[0].name).toBe("note.md");
    expect(scan.status.scans[0].skipped).toBeGreaterThan(0);
    expect(permittedRelative("../outside.md")).toBe(false);
    expect(permittedRelative("a\\b.md")).toBe(false);
    expect(permittedRelative("C:/x.md")).toBe(false);
  });
  test("changed content with identical size/mtime, deletions and symlink replacements are withheld", async () => {
    const target = path.join(folder, "plan.md");
    await fs.writeFile(target, "First content");
    await addFolder(folder, "folder", "Business");
    await refreshFiles();
    const stat = await fs.stat(target);
    await fs.writeFile(target, "Other content");
    await fs.utimes(target, stat.atime, stat.mtime);
    expect((await fileSnapshot()).status.files).toBe(0);
    expect((await connectedFileDocuments()).documents).toEqual([]);
    await refreshFiles();
    expect((await fileSnapshot()).status.files).toBe(1);
    await fs.unlink(target);
    expect((await fileSnapshot()).status.stale).toBe(1);
    await fs.writeFile(path.join(temp, "outside.md"), "Other content");
    await fs.symlink(path.join(temp, "outside.md"), target);
    expect((await fileSnapshot()).files).toEqual([]);
  });
  test("removal purges connected snapshot without changing originals or imported knowledge", async () => {
    await fs.writeFile(path.join(folder, "plan.md"), "Private source");
    await addFolder(folder, "folder", "Business");
    await fs.writeFile(
      path.join(process.env.GW_SYNC_DATA_DIR!, "knowledge.json"),
      '["retained"]',
    );
    const scan = await refreshFiles();
    await removeFileRoot(scan.status.roots[0].id);
    expect((await fileSnapshot()).status.roots).toEqual([]);
    await expect(
      fs.stat(
        path.join(process.env.GW_SYNC_DATA_DIR!, "local-file-index.json"),
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(await fs.readFile(path.join(folder, "plan.md"), "utf8")).toBe(
      "Private source",
    );
    expect(
      await fs.readFile(
        path.join(process.env.GW_SYNC_DATA_DIR!, "knowledge.json"),
        "utf8",
      ),
    ).toBe('["retained"]');
  });
  test("new roots invalidate previous snapshot until refresh; missing folders drop previous text", async () => {
    await fs.writeFile(path.join(folder, "plan.md"), "Business");
    await addFolder(folder, "folder", "Business");
    await refreshFiles();
    const second = path.join(temp, "second");
    await fs.mkdir(second);
    await fs.writeFile(path.join(second, "new.md"), "Second source");
    await addFolder(second, "folder", "Second");
    expect((await fileSnapshot()).status.warning).toContain(
      "selection changed",
    );
    expect((await fileSnapshot()).files).toEqual([]);
    await refreshFiles();
    expect((await fileSnapshot()).status.files).toBe(2);
    await fs.rm(folder, { recursive: true });
    const missing = await refreshFiles();
    expect(missing.status.files).toBe(1);
    expect(missing.status.scans[0].partial).toBe(true);
  });
  test("oversize, unsupported, empty and invalid PDFs report partial coverage while valid text survives", async () => {
    await fs.writeFile(path.join(folder, "large.md"), "x".repeat(2_000_001));
    await fs.writeFile(path.join(folder, "empty.md"), "");
    await fs.writeFile(path.join(folder, "bad.pdf"), "Not a PDF");
    await fs.writeFile(path.join(folder, "image.png"), "Unsupported image");
    await fs.writeFile(path.join(folder, "good.txt"), "Readable text");
    await addFolder(folder, "folder", "Business");
    const scan = await refreshFiles();
    expect(scan.status.files).toBe(1);
    expect(scan.status.scans[0].partial).toBe(true);
    expect(scan.status.scans[0].skipped).toBe(4);
  });
  test("index corruption fails closed; refresh rebuilds without changing sources", async () => {
    await fs.writeFile(path.join(folder, "plan.md"), "Source");
    await addFolder(folder, "folder", "Business");
    await refreshFiles();
    await fs.writeFile(
      path.join(process.env.GW_SYNC_DATA_DIR!, "local-file-index.json"),
      "broken",
    );
    await expect(fileSnapshot()).rejects.toThrow("Local file index");
    await refreshFiles();
    expect((await fileSnapshot()).status.files).toBe(1);
  });
  test("local setup is idempotent, rejects broad roots/links and preserves malformed configuration", async () => {
    await addFolder(folder, "folder", "Business");
    await addFolder(folder, "folder", "Duplicate");
    expect((await fileSnapshot()).status.roots).toHaveLength(1);
    await expect(addFolder(os.homedir(), "folder", "Home")).rejects.toThrow(
      "specific business folder",
    );
    await expect(
      addFolder(path.parse(folder).root, "folder", "Drive"),
    ).rejects.toThrow("specific business folder");
    await fs.symlink(folder, path.join(temp, "link"), "dir");
    await expect(
      addFolder(path.join(temp, "link"), "folder", "Link"),
    ).rejects.toThrow("ordinary");
    await fs.writeFile(
      path.join(process.env.GW_SYNC_DATA_DIR!, "local-folders.json"),
      "broken",
    );
    await expect(addFolder(folder, "folder", "Business")).rejects.toThrow(
      "preserved",
    );
    expect(
      await fs.readFile(
        path.join(process.env.GW_SYNC_DATA_DIR!, "local-folders.json"),
        "utf8",
      ),
    ).toBe("broken");
    const invalid = JSON.stringify({ version: 1, roots: [{ path: folder }] });
    await fs.writeFile(
      path.join(process.env.GW_SYNC_DATA_DIR!, "local-folders.json"),
      invalid,
    );
    await expect(addFolder(folder, "folder", "Business")).rejects.toThrow(
      "preserved",
    );
    expect(
      await fs.readFile(
        path.join(process.env.GW_SYNC_DATA_DIR!, "local-folders.json"),
        "utf8",
      ),
    ).toBe(invalid);
  });
  test("extracts PDF and workbook text with source locations and cached-value warnings", async () => {
    await fs.copyFile(
      "tests/fixtures/synthetic-services.pdf",
      path.join(folder, "services.pdf"),
    );
    await fs.copyFile(
      "tests/fixtures/synthetic-forecast.xlsx",
      path.join(folder, "forecast.xlsx"),
    );
    await addFolder(folder, "folder", "Business");
    const result = await refreshFiles();
    expect(result.status.files).toBe(2);
    expect(
      result.files.find((f) => f.name === "services.pdf")!.documents[0]
        .location,
    ).toContain("Page 1");
    expect(
      result.files.find((f) => f.name === "forecast.xlsx")!.documents[0]
        .location,
    ).toContain("Sheet");
    expect(result.status.scans[0].issues.join(" ")).toContain(
      "not recalculated",
    );
  });
  test("file cap and depth limit are visible rather than claiming whole-folder coverage", async () => {
    for (let i = 0; i < 205; i++)
      await fs.writeFile(path.join(folder, `note-${i}.md`), "Approved source");
    await addFolder(folder, "folder", "Business");
    const result = await refreshFiles();
    expect(result.status.files).toBe(200);
    expect(result.status.scans[0].partial).toBe(true);
    await fs.rm(folder, { recursive: true });
    await fs.mkdir(folder);
    const deep = path.join(
      folder,
      ...Array.from({ length: 10 }, (_, i) => "level" + i),
    );
    await fs.mkdir(deep, { recursive: true });
    await fs.writeFile(path.join(deep, "note.md"), "Too deep");
    expect((await refreshFiles()).status.scans[0].partial).toBe(true);
  });
  test("root replacement by a symlink never exposes another folder", async () => {
    await fs.writeFile(path.join(folder, "plan.md"), "Approved");
    await addFolder(folder, "folder", "Business");
    await refreshFiles();
    await fs.rename(folder, folder + "-old");
    const outside = path.join(temp, "outside");
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, "plan.md"), "Not approved");
    await fs.symlink(outside, folder, "dir");
    expect((await fileSnapshot()).files).toEqual([]);
    expect((await refreshFiles()).status.files).toBe(0);
  });
});
