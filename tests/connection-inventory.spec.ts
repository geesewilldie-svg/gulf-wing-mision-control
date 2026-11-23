import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { connectionInventory } from "../lib/server/connection-inventory";
import { connectionIntent } from "../lib/connection-intent";
import { fixtureRole } from "./helpers/access";
import { openAssistant } from "./helpers/assistant";

test("connection inventory separates public/private setup, selected vaults, saved scopes and unbuilt adapters", async () => {
  const result = await connectionInventory({
    providers: async () => [
      {
        id: "local",
        name: "Local Ollama",
        configured: true,
        external: false,
        detail: "Configured locally",
      },
      {
        id: "gemini",
        name: "Gemini",
        configured: false,
        external: true,
        detail: "Public-only policy",
      },
    ],
    publicGemini: async () => ({
      configured: true,
      enabled: true,
      supported: true,
      policy: "public-only",
      model: "fixture",
      dailyLimit: 10,
    }),
    google: async () => ({
      configured: true,
      connected: true,
      email: "private@example.test",
      accounts: [
        {
          id: "one",
          email: "private@example.test",
          calendar: true,
          drive: false,
        },
      ],
      scope: "read only",
      redirect: "http://localhost:3000",
    }),
    folders: async () => [
      {
        id: "root",
        label: "Notes",
        kind: "obsidian",
        path: "C:/PRIVATE_VAULT_PATH",
      },
    ],
    codex: async () => true,
  });
  const card = (id: string) =>
    result.capabilities.find((card) => card.id === id)!;
  expect(card("gemini-public").status).toBe("Enabled for public questions");
  expect(card("gemini").status).toBe("Not enabled");
  expect(card("obsidian").status).toBe("Vault selected");
  expect(card("codex-worker").status).toContain("not live-checked");
  expect(card("google-calendar").status).toContain("Authorization saved");
  expect(card("google-drive").status).toBe("No saved authorization");
  expect(card("github-copilot").status).toBe("Integration not built");
  expect(card("microsoft-copilot").status).toBe("Integration not built");
  expect(JSON.stringify(result)).not.toContain("private@example.test");
  expect(JSON.stringify(result)).not.toContain("PRIVATE_VAULT_PATH");
  expect(connectionIntent("Nexus, please show my connections.")).toBe(true);
  expect(connectionIntent("Show my connections and enable Gemini")).toBe(false);
  const unavailable = async (): Promise<never> => {
    throw Error("PRIVATE_SECRET_VALUE");
  };
  const failed = await connectionInventory({
    providers: unavailable,
    publicGemini: unavailable,
    google: unavailable,
    folders: unavailable,
    codex: unavailable,
  });
  expect(
    failed.capabilities.filter(
      (card) => card.status === "Settings unavailable",
    ),
  ).toHaveLength(9);
  expect(JSON.stringify(failed)).not.toContain("PRIVATE_SECRET_VALUE");
});

test("default inventory performs no external calls and preserves unreadable settings", async () => {
  const dir = await fs.mkdtemp(path.join(tmpdir(), "nexus-connections-"));
  const prior = process.env.GW_SYNC_DATA_DIR,
    priorFetch = globalThis.fetch;
  process.env.GW_SYNC_DATA_DIR = dir;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    throw Error("External request forbidden");
  }) as typeof fetch;
  try {
    await fs.writeFile(path.join(dir, "local-folders.json"), "{");
    await fs.writeFile(path.join(dir, "google-tokens.json"), "{");
    const result = await connectionInventory();
    expect(calls).toBe(0);
    expect(
      result.capabilities.find((card) => card.id === "obsidian")!.status,
    ).toBe("Settings unavailable");
    expect(
      result.capabilities.find((card) => card.id === "google-calendar")!.status,
    ).toBe("Settings unavailable");
    expect(
      await fs.readFile(path.join(dir, "google-tokens.json"), "utf8"),
    ).toBe("{");
  } finally {
    globalThis.fetch = priorFetch;
    if (prior === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = prior;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("connection setup command is controller-only, same-origin and local-only", async ({
  context,
}) => {
  const data = { query: "Show my connections", mode: "auto" };
  expect(
    (await context.request.post("/api/sync/nexus", { data })).status(),
  ).toBe(401);
  await fixtureRole(context, "display");
  expect(
    (await context.request.post("/api/sync/nexus", { data })).status(),
  ).toBe(403);
  await fixtureRole(context, "controller");
  expect(
    (
      await context.request.post("/api/sync/nexus", {
        data,
        headers: { Origin: "https://foreign.example" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await context.request.post("/api/sync/nexus", {
        data: { ...data, mode: "gemini", allowExternal: true },
      })
    ).status(),
  ).toBe(403);
  const result = await context.request.post("/api/sync/nexus", { data });
  expect(result.status()).toBe(200);
  expect((await result.json()).capabilities).toHaveLength(11);
});

test("connection setup cards remain readable on controller screens", async ({
  page,
  context,
}) => {
  await fixtureRole(context, "controller");
  await page.route("**/api/sync/nexus", (route) => {
    if (route.request().method() !== "POST") return route.continue();
    return route.fulfill({
      json: {
        engine: "Nexus connection setup",
        answer: "Saved settings, not live service tests",
        sources: [],
        capabilities: [
          {
            id: "obsidian",
            name: "Obsidian selected vaults",
            status: "Vault selected",
            detail: "Use Show my source map for indexed notes.",
            authorization: "Read-only selected folders.",
          },
          {
            id: "microsoft-copilot",
            name: "Microsoft Copilot",
            status: "Integration not built",
            detail: "Retained connection target.",
            authorization: "No account access supplied.",
          },
        ],
      },
    });
  });
  await page.goto("/nexus");
  await openAssistant(page);
  await page
    .locator("form")
    .getByLabel("Ask Nexus", { exact: true })
    .fill("Show my connections");
  await page
    .locator("form")
    .getByRole("button", { name: "Ask Nexus", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Obsidian selected vaults", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Microsoft Copilot", exact: true }),
  ).toContainText("Integration not built");
  await page
    .getByRole("region", { name: "Microsoft Copilot", exact: true })
    .screenshot({
      path: `artifacts/connections/${test.info().project.name}.png`,
    });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("activity detects the selected Obsidian vault without the legacy environment variable", async ({
  context,
}) => {
  await fixtureRole(context, "controller");
  const filename = path.join(
    process.env.GW_SYNC_TEST_ROOT!,
    "local-folders.json",
  );
  let previous: Buffer | undefined;
  try {
    previous = await fs.readFile(filename);
  } catch {}
  try {
    await fs.writeFile(
      filename,
      JSON.stringify({
        version: 1,
        roots: [
          {
            id: "a".repeat(24),
            label: "Selected vault",
            kind: "obsidian",
            path: process.env.GW_SYNC_TEST_ROOT,
          },
        ],
      }),
    );
    const response = await context.request.get("/api/sync/agents");
    expect(response.status()).toBe(200);
    expect((await response.json()).obsidian).toBe(true);
    await fs.writeFile(filename, JSON.stringify({ version: 1, roots: [] }));
    expect(
      (await (await context.request.get("/api/sync/agents")).json()).obsidian,
    ).toBe(false);
  } finally {
    if (previous) await fs.writeFile(filename, previous);
    else await fs.rm(filename, { force: true });
  }
});
