import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  copilotProfileEnvironment,
  prepareCopilotProfile,
  copilotPreparationStatus,
} from "../scripts/copilot-profile-lib.mjs";
import { connectionInventory } from "../lib/server/connection-inventory";

test("Copilot profile strips inherited credentials, tools, hooks, provider and telemetry overrides", () => {
  const env = copilotProfileEnvironment("C:/nexus-private", {
    PATH: "path",
    SystemRoot: "C:/Windows",
    APPDATA: "C:/AppData",
    COPILOT_HOME: "normal-profile",
    COPILOT_ALLOW_ALL: "true",
    COPILOT_ASSISTED_APPROVAL: "true",
    COPILOT_PROVIDER_API_KEY_COMMAND: "run something",
    COPILOT_GITHUB_TOKEN: "secret",
    GITHUB_TOKEN: "secret",
    GH_TOKEN: "secret",
    GW_NEXUS_OPENAI_KEY: "private",
    OTEL_EXPORTER_OTLP_ENDPOINT: "https://external.example",
    COPILOT_CUSTOM_INSTRUCTIONS_DIRS: "private",
    COPILOT_SKILLS_DIRS: "private",
    NODE_OPTIONS: "--require hook.js",
    USE_TGREP: "true",
  });
  expect(env.COPILOT_HOME).not.toBe("normal-profile");
  expect(env.COPILOT_HOME).toContain("copilot-profile");
  expect(env.COPILOT_PLUGIN_DIR_ONLY).toBe("true");
  expect(env.COPILOT_AUTO_UPDATE).toBe("false");
  expect(env.COPILOT_ALLOW_ALL).toBe("false");
  expect(env.USE_TGREP).toBe("false");
  expect(env.PATH).toBe("path");
  expect(env.SystemRoot).toBe("C:/Windows");
  for (const key of [
    "COPILOT_GITHUB_TOKEN",
    "GITHUB_TOKEN",
    "GH_TOKEN",
    "COPILOT_PROVIDER_API_KEY_COMMAND",
    "GW_NEXUS_OPENAI_KEY",
    "OTEL_EXPORTER_OTLP_ENDPOINT",
    "COPILOT_CUSTOM_INSTRUCTIONS_DIRS",
    "COPILOT_SKILLS_DIRS",
    "NODE_OPTIONS",
  ])
    expect(env[key]).toBeUndefined();
});
test("profile preparation pins package identity, preserves existing settings and never claims sign-in", async () => {
  const dir = await fs.mkdtemp(path.join(tmpdir(), "nexus-copilot-profile-"));
  try {
    const pkg = path.join(dir, "installed");
    await fs.mkdir(pkg);
    const entry = path.join(pkg, "npm-loader.js");
    await fs.writeFile(
      entry,
      "throw Error('must never execute during metadata checks');",
    );
    await fs.writeFile(
      path.join(pkg, "package.json"),
      JSON.stringify({
        name: "@github/copilot",
        version: "1.0.114",
        bin: { copilot: "npm-loader.js" },
      }),
    );
    const data = path.join(dir, "private");
    await expect(prepareCopilotProfile(data, entry, "linux")).rejects.toThrow(
      "Windows",
    );
    const prepared = await prepareCopilotProfile(data, entry, "win32");
    expect(prepared.cwd).toBe(path.join(data, "copilot-work"));
    expect(await copilotPreparationStatus(data)).toEqual({
      prepared: true,
      version: "1.0.114",
    });
    const config = path.join(data, "copilot-adapter.json");
    const before = await fs.readFile(config, "utf8");
    expect(before).not.toContain("secret");
    expect(before).not.toContain("enabled");
    await prepareCopilotProfile(data, entry, "win32");
    expect(await fs.readFile(config, "utf8")).toBe(before);
    await fs.writeFile(
      path.join(pkg, "package.json"),
      JSON.stringify({
        name: "@github/copilot",
        version: "9.9.9",
        bin: { copilot: "npm-loader.js" },
      }),
    );
    expect((await copilotPreparationStatus(data)).warning).toContain(
      "preserved",
    );
    await expect(prepareCopilotProfile(data, entry, "win32")).rejects.toThrow(
      "1.0.114",
    );
    expect(await fs.readFile(config, "utf8")).toBe(before);
    await fs.writeFile(
      path.join(pkg, "package.json"),
      JSON.stringify({
        name: "@github/copilot",
        version: "1.0.114",
        bin: { copilot: "npm-loader.js" },
      }),
    );
    await fs.writeFile(config, "{");
    await expect(prepareCopilotProfile(data, entry, "win32")).rejects.toThrow();
    expect(await fs.readFile(config, "utf8")).toBe("{");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("connection setup distinguishes a prepared profile from a live model adapter", async () => {
  const result = await connectionInventory({
    providers: async () => [],
    publicGemini: async () => ({
      configured: false,
      enabled: false,
      supported: true,
      policy: "public-only",
      model: null,
      dailyLimit: 0,
    }),
    google: async () => ({
      configured: false,
      connected: false,
      email: null,
      accounts: [],
      scope: "",
      redirect: "",
    }),
    folders: async () => [],
    codex: async () => false,
    copilot: async () => ({ prepared: true, version: "1.0.114" }),
  });
  const card = result.capabilities.find(
    (card) => card.id === "github-copilot",
  )!;
  expect(card.status).toBe("Profile prepared — model adapter pending");
  expect(card.detail).toContain("unverified");
  expect(card.authorization).toContain("No automatic delegation");
  expect(
    result.capabilities.find((card) => card.id === "microsoft-copilot")!.status,
  ).toBe("Integration not built");
});
