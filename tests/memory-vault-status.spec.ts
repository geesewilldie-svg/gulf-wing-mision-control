import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  memoryVaultStatus,
  prepareMemoryVault,
  disableMemoryVault,
  writeMemorySnapshot,
} from "../scripts/memory-vault-lib.mjs";
import { fixtureRole, fixtureCookieHeader } from "./helpers/access";

test("vault status supports legacy grants, disable, local re-enable and unavailable folders without editing notes", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nexus-vault-status-"));
  try {
    expect((await memoryVaultStatus(dir)).state).toBe("not-configured");
    const vault = path.join(dir, "vault");
    await fs.mkdir(vault);
    await fs.writeFile(
      path.join(dir, "local-folders.json"),
      JSON.stringify({
        version: 1,
        roots: [
          {
            id: "c".repeat(24),
            label: "Selected test vault",
            kind: "obsidian",
            path: vault,
          },
        ],
      }),
    );
    const target = await prepareMemoryVault(dir, "c".repeat(24));
    const grantFile = path.join(dir, "memory-vault.json");
    const grant = JSON.parse(await fs.readFile(grantFile, "utf8"));
    delete grant.enabled; // Existing Windows installations have legacy version-1 grants.
    await fs.writeFile(grantFile, JSON.stringify(grant));
    const status = await memoryVaultStatus(dir);
    expect(status).toMatchObject({
      state: "ready",
      label: "Selected test vault",
    });
    expect(JSON.stringify(status)).not.toContain(dir);
    const saved = await writeMemorySnapshot(dir, "retained note", "personal");
    const batch = (await fs.readdir(target))[0];
    await disableMemoryVault(dir);
    expect((await memoryVaultStatus(dir)).state).toBe("disabled");
    await expect(
      writeMemorySnapshot(dir, "blocked", "personal"),
    ).rejects.toThrow("disabled");
    expect(
      await fs.readFile(path.join(target, batch, saved.filename), "utf8"),
    ).toBe("retained note");
    expect(await prepareMemoryVault(dir, "c".repeat(24))).toBe(target);
    expect((await memoryVaultStatus(dir)).state).toBe("ready");
    expect(await prepareMemoryVault(dir, "c".repeat(24))).toBe(target); // Repeat setup is safe.
    await fs.rename(target, target + "-offline");
    expect((await memoryVaultStatus(dir)).state).toBe("unavailable");
    await disableMemoryVault(dir);
    expect((await memoryVaultStatus(dir)).state).toBe("disabled");
    await expect(prepareMemoryVault(dir, "c".repeat(24))).rejects.toThrow();
    const text = await fs.readFile(grantFile, "utf8");
    await fs.writeFile(grantFile, "{invalid");
    expect((await memoryVaultStatus(dir)).state).toBe("unavailable");
    await expect(disableMemoryVault(dir)).rejects.toThrow();
    expect(await fs.readFile(grantFile, "utf8")).toBe("{invalid");
    expect(text).toContain('"enabled":false');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("status and disable require controller authorization and same origin", async ({
  request,
}) => {
  for (const op of [
    "memory.vault.status",
    "memory.vault.disable",
    "memory.journal.disable",
  ]) {
    expect(
      (await request.post("/api/sync/foundation", { data: { op } })).status(),
    ).toBe(401);
    expect(
      (
        await request.post("/api/sync/foundation", {
          data: { op },
          headers: { Cookie: fixtureCookieHeader("display") },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await request.post("/api/sync/foundation", {
          data: { op },
          headers: {
            Cookie: fixtureCookieHeader("controller"),
            Origin: "https://other.example",
          },
        })
      ).status(),
    ).toBe(403);
  }
});

test("desktop and phone show vault status and disable receipt beside controls", async ({
  page,
  context,
}) => {
  await fixtureRole(context, "controller");
  let disabled = false;
  await page.route("**/api/sync/foundation", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const body = route.request().postDataJSON();
    if (body.op === "memory.vault.disable") {
      disabled = true;
      return route.fulfill({ json: { state: "disabled" } });
    }
    if (body.op === "memory.vault.status")
      return route.fulfill({
        json: disabled
          ? { state: "disabled" }
          : {
              state: "ready",
              label: "Test Knowledge",
              folder: "Nexus Memory Snapshots",
            },
      });
    return route.continue();
  });
  await page.goto("/nexus");
  await page.getByRole("button", { name: "Foundation", exact: true }).click();
  const panel = page.getByRole("region", {
    name: "Obsidian vault save connection",
  });
  await expect(panel).toContainText("Ready for reviewed saves");
  await expect(panel).toContainText("Test Knowledge");
  await panel
    .getByRole("button", { name: "Disable future vault saves" })
    .click();
  await expect(panel.getByRole("status")).toContainText(
    "Existing notes remain",
  );
  await expect(panel).toContainText("Vault saves disabled");
  await expect(
    panel.getByRole("button", { name: "Disable future vault saves" }),
  ).toHaveCount(0);
  await panel.getByRole("button", { name: "Refresh vault status" }).click();
  await expect(panel).toContainText("Run Setup-Nexus-Memory-Vault.cmd");
});
