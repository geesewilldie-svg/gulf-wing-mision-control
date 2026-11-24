import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GET } from "../app/api/sync/files/original/route";
import { token } from "../lib/server/sync-store";
import { refreshFiles } from "../lib/server/local-files";
import { fixtureRole } from "./helpers/access";
import { openAssistant } from "./helpers/assistant";

test("original endpoint returns exact bounded bytes with safe dispositions and rejects unauthorized or stale reads", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nexus-original-"));
  const previous = process.env.GW_SYNC_DATA_DIR;
  process.env.GW_SYNC_DATA_DIR = dir;
  const config = {
    version: 1 as const,
    pairingHash: "a".repeat(64),
    signingSecret: "b".repeat(64),
  };
  try {
    const folder = path.join(dir, "files");
    await fs.mkdir(folder);
    await fs.copyFile(
      "tests/fixtures/synthetic-services.pdf",
      path.join(folder, "services.pdf"),
    );
    await fs.copyFile(
      "tests/fixtures/synthetic-forecast.xlsx",
      path.join(folder, "forecast.xlsx"),
    );
    await fs.writeFile(
      path.join(folder, "café.md"),
      "# Owner text\n<script>untrusted text</script>",
    );
    await fs.writeFile(
      path.join(dir, "sync-config.json"),
      JSON.stringify(config),
    );
    const rootsFile = path.join(dir, "local-folders.json");
    await fs.writeFile(
      rootsFile,
      JSON.stringify({
        version: 1,
        roots: [
          {
            id: "f".repeat(24),
            kind: "folder",
            label: "Selected",
            path: folder,
          },
        ],
      }),
    );
    const snapshot = await refreshFiles();
    const pdf = snapshot.files.find((f) => f.name === "services.pdf")!;
    const sheet = snapshot.files.find((f) => f.name === "forecast.xlsx")!;
    const note = snapshot.files.find((f) => f.name === "café.md")!;
    const ask = (
      id: string,
      hash: string,
      extra = "",
      role?: "controller" | "display",
      headers: Record<string, string> = {},
    ) =>
      GET(
        new Request(
          `http://localhost:3000/api/sync/files/original?id=${id}&hash=${hash}${extra}`,
          {
            headers: {
              host: "localhost:3000",
              ...(role
                ? { cookie: "gw_sync_session=" + token(config, role) }
                : {}),
              ...headers,
            },
          },
        ),
      );
    expect((await ask(pdf.id, pdf.hash)).status).toBe(401);
    expect((await ask(pdf.id, pdf.hash, "", "display")).status).toBe(403);
    expect(
      (
        await ask(pdf.id, pdf.hash, "", "controller", {
          origin: "https://other.example",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await ask(pdf.id, pdf.hash, "", "controller", {
          "sec-fetch-site": "same-site",
        })
      ).status,
    ).toBe(403);
    expect(
      (await ask(pdf.id, pdf.hash, "&path=../../secret", "controller")).status,
    ).toBe(400);
    expect(
      (await ask(pdf.id, pdf.hash, "&id=duplicate", "controller")).status,
    ).toBe(400);
    expect((await ask("../../secret", pdf.hash, "", "controller")).status).toBe(
      400,
    );
    expect((await ask(pdf.id, "0".repeat(64), "", "controller")).status).toBe(
      409,
    );
    const original = await ask(pdf.id, pdf.hash, "", "controller", {
      "sec-fetch-site": "same-origin",
    });
    expect(original.status).toBe(200);
    expect(original.headers.get("content-type")).toBe("application/pdf");
    expect(original.headers.get("content-disposition")).toContain("inline;");
    expect(original.headers.get("cache-control")).toContain("no-store");
    expect(original.headers.get("x-content-type-options")).toBe("nosniff");
    expect(original.headers.get("cross-origin-resource-policy")).toBe(
      "same-origin",
    );
    expect(Buffer.from(await original.arrayBuffer())).toEqual(
      await fs.readFile(path.join(folder, pdf.name)),
    );
    const download = await ask(pdf.id, pdf.hash, "&download=1", "controller");
    expect(download.headers.get("content-disposition")).toContain(
      "attachment;",
    );
    const workbook = await ask(sheet.id, sheet.hash, "", "controller");
    expect(workbook.headers.get("content-type")).toContain(
      "spreadsheetml.sheet",
    );
    expect(workbook.headers.get("content-disposition")).toContain(
      "attachment;",
    );
    expect(Buffer.from(await workbook.arrayBuffer())).toEqual(
      await fs.readFile(path.join(folder, sheet.name)),
    );
    const plain = await ask(note.id, note.hash, "", "controller");
    expect(plain.headers.get("content-type")).toContain("text/plain");
    expect(plain.headers.get("content-disposition")).toContain("caf%C3%A9.md");
    expect(await plain.text()).toContain("<script>untrusted text</script>");
    await fs.appendFile(path.join(folder, pdf.name), "changed");
    expect((await ask(pdf.id, pdf.hash, "", "controller")).status).toBe(409);
    await fs.writeFile(path.join(folder, note.name), Buffer.alloc(2_000_001));
    expect((await ask(note.id, note.hash, "", "controller")).status).toBe(409);
    await fs.writeFile(rootsFile, JSON.stringify({ version: 1, roots: [] }));
    expect((await ask(sheet.id, sheet.hash, "", "controller")).status).toBe(
      409,
    );
  } finally {
    if (previous === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = previous;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("desktop and phone offer separate original PDF and download links after indexed reading", async ({
  page,
  context,
}) => {
  await fixtureRole(context, "controller");
  const id = "a".repeat(24),
    hash = "b".repeat(64);
  await page.route("**/api/sync/nexus", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    return route.fulfill({
      json: {
        engine: "Nexus laptop files",
        answer: "Indexed PDF excerpt",
        sources: [],
        warnings: [],
        fileRead: { id, hash, name: "services.pdf", part: 1, totalParts: 1 },
      },
    });
  });
  const opened: string[] = [];
  await context.route("**/api/sync/files/original?**", async (route) => {
    opened.push(route.request().url());
    return route.fulfill({
      contentType: "text/plain",
      body: "Original source response fixture",
    });
  });
  await page.goto("/nexus");
  await openAssistant(page);
  await page
    .locator("form")
    .getByLabel("Ask Nexus", { exact: true })
    .fill("Read file: services.pdf");
  await page
    .locator("form")
    .getByRole("button", { name: "Ask Nexus", exact: true })
    .click();
  const actions = page.getByRole("region", { name: "Original file actions" });
  const view = actions.getByRole("link", {
    name: "Open original PDF",
    exact: true,
  });
  await expect(view).toHaveAttribute(
    "href",
    `/api/sync/files/original?id=${id}&hash=${hash}`,
  );
  await expect(view).toHaveAttribute("target", "_blank");
  await expect(
    actions.getByRole("link", { name: "Download original file", exact: true }),
  ).toHaveAttribute(
    "href",
    `/api/sync/files/original?id=${id}&hash=${hash}&download=1`,
  );
  await expect(view).toHaveAttribute("rel", "noopener noreferrer");
  await expect(actions).toContainText("Source files are not edited");
  await view.click();
  await expect.poll(() => opened.length).toBe(1);
  expect(opened[0]).toContain(`/api/sync/files/original?id=${id}&hash=${hash}`);
});
