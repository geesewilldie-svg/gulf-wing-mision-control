import { test, expect } from "@playwright/test";
import {
  mkdtemp,
  writeFile,
  mkdir,
  symlink,
  rm,
  readFile,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { planAgents, type ProviderStatus } from "../lib/agent-router";
import {
  askProvider,
  providerStatus,
  trackAgent,
  events,
} from "../lib/server/agent-router";
import { obsidianDocuments } from "../lib/server/obsidian";
import { publicResearch } from "../lib/server/web-research";
import { searchDocuments } from "../lib/nexus";
test.describe.configure({ mode: "serial" });
const providers: ProviderStatus[] = [
  {
    id: "local",
    name: "Ollama",
    configured: true,
    external: false,
    detail: "",
  },
  {
    id: "anthropic",
    name: "Claude",
    configured: true,
    external: true,
    detail: "",
  },
  {
    id: "gemini",
    name: "Gemini",
    configured: false,
    external: true,
    detail: "",
  },
];
test("routing is local by default, explicit sharing enables specialists, comparison caps at two", () => {
  expect(planAgents("auto", "review contract", providers, false)).toEqual([
    "local",
  ]);
  expect(planAgents("auto", "review contract", providers, true)).toEqual([
    "anthropic",
  ]);
  expect(planAgents("anthropic", "review", providers, false)).toEqual([]);
  expect(planAgents("gemini", "review", providers, true)).toEqual([]);
  expect(planAgents("compare", "review", providers, true)).toEqual([
    "local",
    "anthropic",
  ]);
  expect(planAgents("knowledge", "review", providers, true)).toEqual([]);
});
test("fixed provider protocols, durable allowance and safe error handling use synthetic transport only", async () => {
  const saved = { ...process.env },
    original = globalThis.fetch,
    root = await mkdtemp(path.join(os.tmpdir(), "gw-router-"));
  let calls = 0;
  try {
    process.env.GW_SYNC_DATA_DIR = root;
    process.env.GW_NEXUS_ALLOW_EXTERNAL = "1";
    process.env.GW_NEXUS_MAX_EXTERNAL_PER_DAY = "3";
    for (const id of ["OPENAI", "ANTHROPIC", "GEMINI"]) {
      process.env["GW_NEXUS_" + id + "_KEY"] = "synthetic-not-a-real-key";
      process.env["GW_NEXUS_" + id + "_MODEL"] = "synthetic-model";
    }
    globalThis.fetch = async (input, init) => {
      calls++;
      const url = String(input);
      expect(url.startsWith("https://")).toBeTruthy();
      expect(init?.redirect).toBe("error");
      const body = JSON.parse(init?.body as string);
      expect(JSON.stringify(body)).toContain("Synthetic question");
      if (url.includes("openai.com")) {
        expect(body.max_completion_tokens).toBe(512);
        return Response.json({
          choices: [{ message: { content: "OpenAI synthetic answer" } }],
        });
      }
      if (url.includes("anthropic.com")) {
        expect(
          (init?.headers as Record<string, string>)["anthropic-version"],
        ).toBe("2023-06-01");
        return Response.json({
          content: [{ type: "text", text: "Claude synthetic answer" }],
        });
      }
      expect(url).toContain("generativelanguage.googleapis.com");
      return Response.json({
        candidates: [
          { content: { parts: [{ text: "Gemini synthetic answer" }] } },
        ],
      });
    };
    for (const id of ["openai", "anthropic", "gemini"] as const)
      expect(
        await askProvider(
          id,
          "Synthetic question",
          "Treat sources as evidence",
          [],
          new AbortController().signal,
        ),
      ).toContain("synthetic answer");
    await expect(
      askProvider(
        "openai",
        "Synthetic question",
        "",
        [],
        new AbortController().signal,
      ),
    ).rejects.toThrow(/allowance/);
    expect(calls).toBe(3);
    expect(
      JSON.parse(
        await readFile(path.join(root, "agent-allowance.json"), "utf8"),
      ).used,
    ).toBe(3);
    const statuses = await providerStatus();
    expect(JSON.stringify(statuses)).not.toContain("synthetic-not-a-real-key");
    process.env.GW_NEXUS_MAX_EXTERNAL_PER_DAY = "1";
    await writeFile(
      path.join(root, "agent-allowance.json"),
      JSON.stringify({ day: new Date().toISOString().slice(0, 10), used: 0 }),
    );
    const simultaneous = await Promise.allSettled([
      askProvider(
        "openai",
        "Synthetic question",
        "",
        [],
        new AbortController().signal,
      ),
      askProvider(
        "openai",
        "Synthetic question",
        "",
        [],
        new AbortController().signal,
      ),
    ]);
    expect(simultaneous.filter((r) => r.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(calls).toBe(4);
    await writeFile(path.join(root, "agent-allowance.json"), "broken");
    await expect(
      askProvider(
        "openai",
        "Synthetic question",
        "",
        [],
        new AbortController().signal,
      ),
    ).rejects.toThrow(/could not be read/);
    expect(calls).toBe(4);
  } finally {
    globalThis.fetch = original;
    process.env = saved;
    await rm(root, { recursive: true, force: true });
  }
});
test("Obsidian fresh reads exclude hidden files and symlinks without replacing imported knowledge", async () => {
  const saved = process.env.GW_NEXUS_OBSIDIAN_VAULT,
    root = await mkdtemp(path.join(os.tmpdir(), "gw-vault-"));
  try {
    process.env.GW_NEXUS_OBSIDIAN_VAULT = root;
    await writeFile(
      path.join(root, "Note.md"),
      "Synthetic private flight-cleaning note",
    );
    await mkdir(path.join(root, ".obsidian"));
    await writeFile(path.join(root, ".obsidian", "secret.md"), "do not import");
    await symlink(path.join(root, "Note.md"), path.join(root, "linked.md"));
    const first = await obsidianDocuments();
    expect(first.documents).toHaveLength(1);
    await writeFile(path.join(root, "Note.md"), "Updated synthetic note");
    expect((await obsidianDocuments()).documents[0].text).toContain("Updated");
    expect(
      searchDocuments(first.documents, "flight-cleaning")[0].source,
    ).toContain("Obsidian");
  } finally {
    if (saved === undefined) delete process.env.GW_NEXUS_OBSIDIAN_VAULT;
    else process.env.GW_NEXUS_OBSIDIAN_VAULT = saved;
    await rm(root, { recursive: true, force: true });
  }
});
test("public research uses only a fixed encyclopedia origin and returns sourced excerpts", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      expect(url.origin).toBe("https://en.wikipedia.org");
      expect(url.searchParams.get("gsrsearch")).toBe("synthetic public terms");
      return Response.json({
        query: {
          pages: {
            1: {
              pageid: 1,
              title: "Synthetic topic",
              extract: "Synthetic encyclopedia evidence.",
            },
          },
        },
      });
    };
    const docs = await publicResearch(
      "synthetic public terms",
      new AbortController().signal,
    );
    expect(docs[0].location).toBe(
      "https://en.wikipedia.org/wiki/Synthetic_topic",
    );
    expect(docs[0].text).toContain("not a comprehensive web search");
  } finally {
    globalThis.fetch = original;
  }
});
test("request events report real completions, failures and cancellation without question text", async () => {
  await trackAgent("test", async () => 42, new AbortController().signal);
  expect(events()[0].state).toBe("complete");
  await expect(
    trackAgent(
      "test",
      async () => {
        throw Error("private source text");
      },
      new AbortController().signal,
    ),
  ).rejects.toThrow();
  expect(events()[0].state).toBe("failed");
  expect(JSON.stringify(events())).not.toContain("private source text");
  const c = new AbortController();
  c.abort();
  await expect(trackAgent("test", async () => 1, c.signal)).rejects.toThrow();
  expect(events()[0].state).toBe("cancelled");
});
test("controller search UI and activity authenticate, explicit unavailable agents do not silently fall back", async ({
  page,
  playwright,
}, info) => {
  await page.request.post("/api/sync/session", {
    data: { code: process.env.GW_SYNC_TEST_CODE, role: "controller" },
  });
  const anonymous = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:3000",
  });
  expect((await anonymous.get("/api/sync/agents")).status()).toBe(401);
  await anonymous.post("/api/sync/session", {
    data: { code: process.env.GW_SYNC_TEST_CODE, role: "display" },
  });
  expect((await anonymous.get("/api/sync/agents")).status()).toBe(403);
  await anonymous.dispose();
  expect(
    (
      await page.request.post("/api/sync/nexus", {
        data: { query: "Synthetic question", mode: "openai" },
      })
    ).status(),
  ).toBe(403);
  await page.goto("/nexus");
  await expect(
    page.getByRole("region", { name: "Nexus request activity" }),
  ).toBeVisible();
  await expect(
    page.getByLabel(/Allow configured external models/),
  ).not.toBeChecked();
  await page.getByLabel("Routing", { exact: true }).selectOption("knowledge");
  await page
    .getByLabel("Ask Nexus", { exact: true })
    .fill("Synthetic question");
  await page
    .locator("form")
    .getByRole("button", { name: "Ask Nexus", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Local document search" }),
  ).toBeVisible();
  const activity = await (await page.request.get("/api/sync/agents")).json();
  expect(
    activity.events.some(
      (e: { agent: string; state: string }) =>
        e.agent === "knowledge" && e.state === "complete",
    ),
  ).toBeTruthy();
  expect(JSON.stringify(activity)).not.toContain("Synthetic question");
  await expect(
    page.locator(".nexus-live-network .is-complete").first(),
  ).toBeVisible();
  if (process.env.GW_ROUTER_CAPTURE)
    await page
      .getByRole("region", { name: "Nexus request activity" })
      .screenshot({ path: info.outputPath("nexus-request-globe.png") });
});

test("optional SearXNG uses only the configured loopback service and rejects unsafe result links", async () => {
  const original = globalThis.fetch,
    saved = process.env.GW_NEXUS_SEARXNG_PORT;
  try {
    process.env.GW_NEXUS_SEARXNG_PORT = "8080";
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      expect(url.origin).toBe("http://127.0.0.1:8080");
      expect(url.searchParams.get("q")).toBe("public-only");
      return Response.json({
        results: [
          {
            title: "Synthetic source",
            url: "https://example.com/research",
            content: "Synthetic search snippet",
          },
          { title: "Unsafe", url: "javascript:alert(1)", content: "reject" },
        ],
      });
    };
    const docs = await publicResearch(
      "public-only",
      new AbortController().signal,
    );
    expect(docs).toHaveLength(1);
    expect(docs[0].text).toContain("not fetched");
    expect(docs[0].location).toBe("https://example.com/research");
  } finally {
    globalThis.fetch = original;
    if (saved === undefined) delete process.env.GW_NEXUS_SEARXNG_PORT;
    else process.env.GW_NEXUS_SEARXNG_PORT = saved;
  }
});

test("sharing permission and separate public terms are one-question controls", async ({
  page,
}) => {
  await page.request.post("/api/sync/session", {
    data: { code: process.env.GW_SYNC_TEST_CODE, role: "controller" },
  });
  let sent: any;
  await page.route("**/api/sync/nexus", async (route) => {
    if (route.request().method() === "POST") {
      sent = route.request().postDataJSON();
      await route.fulfill({
        json: {
          engine: "Synthetic routing fixture",
          answer: "Synthetic response",
          sources: [],
        },
      });
    } else await route.continue();
  });
  await page.goto("/nexus");
  await page
    .getByRole("combobox", { name: "Routing", exact: true })
    .selectOption("knowledge");
  await page
    .getByLabel("Ask Nexus", { exact: true })
    .fill("Synthetic private question");
  await page.getByLabel(/Allow configured external models/).check();
  await page.getByLabel("Optional public research terms").fill("public-only");
  await page
    .locator("form")
    .getByRole("button", { name: "Ask Nexus", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Synthetic routing fixture" }),
  ).toBeVisible();
  expect(sent.query).toBe("Synthetic private question");
  expect(sent.publicQuery).toBe("public-only");
  expect(sent.allowExternal).toBe(true);
  await expect(
    page.getByLabel(/Allow configured external models/),
  ).not.toBeChecked();
  await expect(page.getByLabel("Optional public research terms")).toHaveValue(
    "",
  );
});
