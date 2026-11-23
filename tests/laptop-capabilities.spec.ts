import { test, expect } from "@playwright/test";
import { mkdtemp, writeFile, rm, access, mkdir } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  laptopCapabilities,
  laptopCapabilitiesIntent,
  laptopCapabilityFacts,
} from "../lib/laptop-capabilities";
import { laptopCapabilitiesAnswer } from "../lib/server/laptop-capabilities";
import { nexusPlanningFacts } from "../lib/server/foundation/planning-quality";
import { fixtureRole } from "./helpers/access";
import { openAssistant } from "./helpers/assistant";

test("versioned capabilities distinguish implemented adapters from missing general control", () => {
  expect(
    new Set(laptopCapabilities.map((capability) => capability.id)).size,
  ).toBe(laptopCapabilities.length);
  expect(
    laptopCapabilities.every(
      (capability) =>
        capability.version === 1 &&
        capability.authorization &&
        capability.verification,
    ),
  ).toBe(true);
  expect(
    laptopCapabilities.find(
      (capability) => capability.id === "desktop.browser-control",
    )!.implemented,
  ).toBe(false);
  expect(laptopCapabilitiesIntent("Show laptop capabilities")).toBe(true);
  expect(
    laptopCapabilitiesIntent("Nexus, please show my laptop capabilities."),
  ).toBe(true);
  expect(laptopCapabilitiesIntent("What can Nexus do on my laptop?")).toBe(
    true,
  );
  expect(
    laptopCapabilitiesIntent("Show laptop capabilities and start services"),
  ).toBe(false);
  expect(nexusPlanningFacts).toContain(laptopCapabilityFacts);
  expect(laptopCapabilityFacts).toContain("no execution tools");
});
test("capability lookup reports configuration honestly without providers or operation records", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "nexus-capabilities-")),
    prior = process.env.GW_SYNC_DATA_DIR,
    originalFetch = globalThis.fetch;
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
  process.env.GW_SYNC_DATA_DIR = dir;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    throw Error("No providers allowed");
  }) as typeof fetch;
  try {
    const empty = await laptopCapabilitiesAnswer();
    expect(
      empty.capabilities.find(
        (capability) => capability.id === "selected-files.read",
      )!.status,
    ).toBe("Folder setup needed");
    await writeFile(path.join(dir, "local-folders.json"), "{");
    expect(
      (await laptopCapabilitiesAnswer()).capabilities.find(
        (capability) => capability.id === "selected-files.read",
      )!.status,
    ).toBe("Settings unavailable");
    await writeFile(
      path.join(dir, "local-folders.json"),
      JSON.stringify({
        version: 1,
        roots: [
          {
            id: "a".repeat(24),
            label: "Private fixture",
            kind: "folder",
            path: path.join(dir, "selected"),
          },
        ],
      }),
    );
    const configured = await laptopCapabilitiesAnswer();
    expect(
      configured.capabilities.find(
        (capability) => capability.id === "selected-files.read",
      )!.status,
    ).toBe("Folders selected");
    expect(
      configured.capabilities.find(
        (capability) => capability.id === "nexus-services.maintain",
      )!.status,
    ).toBe("Windows host required");
    expect(JSON.stringify(configured)).not.toContain(dir);
    Object.defineProperty(process, "platform", {
      value: "win32",
      configurable: true,
    });
    const maintenanceStatus = async () =>
      (await laptopCapabilitiesAnswer()).capabilities.find(
        (capability) => capability.id === "nexus-services.maintain",
      )!.status;
    expect(await maintenanceStatus()).toBe("Local enablement needed");
    await writeFile(path.join(dir, "maintenance.json"), "{");
    expect(await maintenanceStatus()).toBe("Settings unavailable");
    await writeFile(
      path.join(dir, "maintenance.json"),
      JSON.stringify({ version: 1, enabled: true }),
    );
    expect(await maintenanceStatus()).toBe("Enabled locally");
    expect(calls).toBe(0);
    await expect(
      access(path.join(dir, "nexus-foundation.sqlite")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      access(path.join(dir, "maintenance-audit.jsonl")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(process, "platform", platform);
    if (prior === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = prior;
    await rm(dir, { recursive: true, force: true });
  }
});
test("capability command requires controller identity, origin and local-only mode", async ({
  context,
}) => {
  const data = { query: "Show laptop capabilities", mode: "auto" };
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
        headers: { Origin: "https://untrusted.example" },
      })
    ).status(),
  ).toBe(403);
  for (const mode of ["gemini", "openai", "anthropic", "compare", "knowledge"])
    expect(
      (
        await context.request.post("/api/sync/nexus", {
          data: { ...data, mode, allowExternal: true },
        })
      ).status(),
    ).toBe(403);
  const result = await context.request.post("/api/sync/nexus", { data });
  expect(result.ok()).toBe(true);
  const body = await result.json();
  expect(body.engine).toBe("Nexus laptop capabilities");
  expect(body.capabilities).toHaveLength(5);
  expect(body.routing.selected).toEqual([]);
});
test("capability cards show honest unsupported actions in the assistant", async ({
  page,
  context,
}, info) => {
  await fixtureRole(context, "controller");
  await page.goto("/nexus");
  await openAssistant(page);
  await page
    .locator("form")
    .getByLabel("Ask Nexus", { exact: true })
    .fill("Show laptop capabilities");
  await page
    .locator("form")
    .getByRole("button", { name: "Ask Nexus", exact: true })
    .click();
  const browser = page.getByRole("region", {
    name: "Browser control",
    exact: true,
  });
  await expect(browser).toContainText("Not built yet");
  await expect(browser).toContainText("not implemented");
  await expect(
    page.getByRole("region", { name: "Reviewed file drafts", exact: true }),
  ).toContainText("explicit review");
  await expect(
    page.getByRole("heading", { name: /Retrieved sources/ }),
  ).toHaveCount(0);
  const list = page.locator(".nexus-capability-list");
  await list.scrollIntoViewIfNeeded();
  expect(
    await list.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await mkdir("artifacts/capabilities", { recursive: true });
  await page.screenshot({
    path: `artifacts/capabilities/${info.project.name}.png`,
  });
});
