import { test, expect, devices, type BrowserContext } from "@playwright/test";
import { createWorkspace } from "../lib/workspace";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

test.describe("laptop shared workspace", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(
    ({ isMobile }) => isMobile,
    "Shared host tests run once, with separate Android and desktop browser profiles.",
  );
  let admin: BrowserContext;
  const code = () => process.env.GW_SYNC_TEST_CODE!;
  const root = () => process.env.GW_SYNC_TEST_ROOT!;
  test.beforeAll(async ({ browser }) => {
    admin = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
    expect(
      (
        await admin.request.post("/api/sync/session", {
          data: { code: code(), role: "controller" },
        })
      ).status(),
    ).toBe(200);
  });
  test.afterAll(async () => {
    await admin?.close();
  });
  test.beforeEach(async () => {
    const current = await (
      await admin.request.get("/api/sync/workspace")
    ).json();
    expect(
      (
        await admin.request.put("/api/sync/workspace", {
          data: { revision: current.revision, workspace: createWorkspace() },
        })
      ).status(),
    ).toBe(200);
  });

  test("authentication, viewer permissions, validation and same-origin checks are enforced", async ({
    browser,
  }) => {
    const guest = await browser.newContext({
      baseURL: "http://127.0.0.1:3000",
    });
    expect((await guest.request.get("/api/sync/workspace")).status()).toBe(401);
    expect(
      (
        await guest.request.post("/api/sync/session", {
          data: { code: "not-the-code", role: "controller" },
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await guest.request.post("/api/sync/session", {
          headers: { Origin: "http://unrelated.example" },
          data: { code: code(), role: "controller" },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await guest.request.post("/api/sync/session", {
          data: { code: code(), role: "display" },
        })
      ).status(),
    ).toBe(200);
    const read = await guest.request.get("/api/sync/workspace");
    expect(read.headers()["cache-control"]).toBe("no-store");
    const current = await read.json();
    expect(
      (
        await guest.request.put("/api/sync/workspace", { data: current })
      ).status(),
    ).toBe(403);
    expect(
      (
        await admin.request.put("/api/sync/workspace", {
          data: { revision: current.revision, workspace: { invalid: true } },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await admin.request.put("/api/sync/workspace", {
          data: { workspace: createWorkspace() },
        })
      ).status(),
    ).toBe(400);
    await guest.close();
  });

  test("concurrent saves have one winner and preserve a disk-backed revision", async () => {
    const current = await (
      await admin.request.get("/api/sync/workspace")
    ).json();
    const a = createWorkspace(),
      b = createWorkspace();
    a.selected = "Claude";
    b.selected = "Hermes";
    const responses = await Promise.all([
      admin.request.put("/api/sync/workspace", {
        data: { revision: current.revision, workspace: a },
      }),
      admin.request.put("/api/sync/workspace", {
        data: { revision: current.revision, workspace: b },
      }),
    ]);
    expect(responses.map((result) => result.status()).sort()).toEqual([
      200, 409,
    ]);
    const latest = await (
      await admin.request.get("/api/sync/workspace")
    ).json();
    expect(latest.revision).toBe(current.revision + 1);
    const disk = JSON.parse(
      readFileSync(path.join(root(), "workspace.json"), "utf8"),
    );
    expect(disk).toEqual(latest);
  });

  test("Android controller updates an independent Windows display, including status and venture", async ({
    browser,
  }) => {
    const phone = await browser.newContext({
      ...devices["Galaxy S24"],
      baseURL: "http://127.0.0.1:3000",
    });
    const tv = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
    const controller = await phone.newPage();
    await controller.goto("/");
    await controller.locator(".sync-controls summary").click();
    await controller.getByLabel("Laptop pairing code").fill(code());
    await controller
      .getByRole("button", { name: "Pair and join", exact: true })
      .click();
    await expect(controller.locator(".sync-connected")).toContainText(
      "Controller access",
    );
    const display = await tv.newPage();
    await display.goto("/display?view=missions");
    await display.locator(".sync-controls summary").click();
    await display.getByLabel("Laptop pairing code").fill(code());
    await display
      .getByRole("button", { name: "Pair display", exact: true })
      .click();
    await expect(display.locator(".sync-connected")).toContainText(
      "Display-only",
    );
    await controller
      .getByRole("button", { name: "New mission", exact: true })
      .click();
    await controller.getByLabel("Mission title").fill("Android to Windows");
    await controller
      .getByRole("button", { name: "Create demo mission" })
      .click();
    await expect(
      display.getByRole("heading", { name: "Android to Windows" }),
    ).toBeVisible({ timeout: 10000 });
    await controller
      .getByRole("button", { name: "Advance Android to Windows" })
      .click();
    await expect(
      display.locator(".display-board>div").filter({
        has: display.getByRole("heading", {
          name: "In progress",
          exact: false,
        }),
      }),
    ).toContainText("Android to Windows");
    await controller.getByRole("button", { name: "Open navigation" }).click();
    await controller
      .getByRole("button", { name: "Aviation", exact: true })
      .click();
    await expect(
      display.getByRole("heading", { name: "Review fleet readiness report" }),
    ).toBeVisible({ timeout: 10000 });
    await display.reload();
    await expect(
      display.getByRole("heading", { name: "Review fleet readiness report" }),
    ).toBeVisible();
    controller.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain("every paired device");
      await dialog.accept();
    });
    await controller
      .getByRole("button", { name: "Reset demo", exact: true })
      .click();
    await expect(
      display.getByRole("heading", { name: "Prepare portfolio briefing" }),
    ).toBeVisible({ timeout: 10000 });
    expect(
      (
        await (await admin.request.get("/api/sync/workspace")).json()
      ).workspace.tasks.some(
        (task: { title: string }) => task.title === "Android to Windows",
      ),
    ).toBeFalsy();
    await phone.close();
    await tv.close();
  });

  test("offline edits retry on reconnect and survive browser reload", async ({
    browser,
  }) => {
    const device = await browser.newContext({
      baseURL: "http://127.0.0.1:3000",
    });
    await device.request.post("/api/sync/session", {
      data: { code: code(), role: "controller" },
    });
    const page = await device.newPage();
    await page.goto("/");
    await page.locator(".sync-controls summary").click();
    await expect(page.locator(".sync-connected")).toBeVisible();
    await page.route("**/api/sync/workspace", (route) => route.abort());
    await page
      .getByRole("button", { name: "New mission", exact: true })
      .click();
    await page.getByLabel("Mission title").fill("Reconnect mission");
    await page.getByRole("button", { name: "Create demo mission" }).click();
    await expect(page.locator(".sync-connected")).toContainText("Offline");
    expect(
      await page.evaluate(
        () => !!sessionStorage.getItem("gulf-wing.pending-shared.v1"),
      ),
    ).toBeTruthy();
    await page.unroute("**/api/sync/workspace");
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Reconnect mission" }),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const latest = await (
          await admin.request.get("/api/sync/workspace")
        ).json();
        return latest.workspace.tasks.some(
          (task: { title: string }) => task.title === "Reconnect mission",
        );
      })
      .toBeTruthy();
    expect(
      await page.evaluate(() =>
        sessionStorage.getItem("gulf-wing.pending-shared.v1"),
      ),
    ).toBeNull();
    await device.close();
  });

  test("conflicts retain unsent edits and require an explicit decision", async ({
    browser,
  }) => {
    const device = await browser.newContext({
      baseURL: "http://127.0.0.1:3000",
    });
    await device.request.post("/api/sync/session", {
      data: { code: code(), role: "controller" },
    });
    const page = await device.newPage();
    await page.goto("/");
    await page.locator(".sync-controls summary").click();
    await expect(page.locator(".sync-connected")).toBeVisible();
    await page.route("**/api/sync/workspace", (route) => route.abort());
    await page
      .getByRole("button", { name: "New mission", exact: true })
      .click();
    await page.getByLabel("Mission title").fill("Pending device version");
    await page.getByRole("button", { name: "Create demo mission" }).click();
    await expect(page.locator(".sync-connected")).toContainText("Offline");
    const current = await (
      await admin.request.get("/api/sync/workspace")
    ).json();
    current.workspace.selected = "Claude";
    await admin.request.put("/api/sync/workspace", { data: current });
    await page.unroute("**/api/sync/workspace");
    await expect(
      page.getByRole("alert", { name: "Sync conflict" }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByRole("heading", { name: "Pending device version" }),
    ).toBeVisible();
    expect(
      (await (await admin.request.get("/api/sync/workspace")).json()).workspace
        .selected,
    ).toBe("Claude");
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Keep this device’s edits", exact: true })
      .click();
    await expect(
      page.getByRole("alert", { name: "Sync conflict" }),
    ).toHaveCount(0);
    await expect
      .poll(async () => {
        const latest = await (
          await admin.request.get("/api/sync/workspace")
        ).json();
        return latest.workspace.tasks.some(
          (task: { title: string }) => task.title === "Pending device version",
        );
      })
      .toBeTruthy();
    await page.route("**/api/sync/workspace", (route) => route.abort());
    await page
      .getByRole("button", { name: "New mission", exact: true })
      .click();
    await page.getByLabel("Mission title").fill("Discard this pending change");
    await page.getByRole("button", { name: "Create demo mission" }).click();
    await expect(page.locator(".sync-connected")).toContainText("Offline");
    const alternate = await (
      await admin.request.get("/api/sync/workspace")
    ).json();
    alternate.workspace.selected = "Hermes";
    await admin.request.put("/api/sync/workspace", { data: alternate });
    await page.unroute("**/api/sync/workspace");
    await expect(
      page.getByRole("alert", { name: "Sync conflict" }),
    ).toBeVisible({ timeout: 10000 });
    await page
      .getByRole("button", { name: "Use laptop’s latest version", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Discard this pending change" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Hermes Operations", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await device.close();
  });

  test("disconnect returns to the preserved local workspace and clears this browser session", async ({
    browser,
  }) => {
    const device = await browser.newContext({
      baseURL: "http://127.0.0.1:3000",
    });
    const page = await device.newPage();
    await page.goto("/");
    await page
      .getByRole("button", { name: "New mission", exact: true })
      .click();
    await page.getByLabel("Mission title").fill("Browser-only mission");
    await page.getByRole("button", { name: "Create demo mission" }).click();
    await page.locator(".sync-controls summary").click();
    await page.getByLabel("Laptop pairing code").fill(code());
    await page
      .getByRole("button", { name: "Pair and join", exact: true })
      .click();
    await expect(page.locator(".sync-connected")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Browser-only mission" }),
    ).toHaveCount(0);
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", {
        name: "Publish this browser’s local workspace",
        exact: true,
      })
      .click();
    await expect
      .poll(async () => {
        const latest = await (
          await admin.request.get("/api/sync/workspace")
        ).json();
        return latest.workspace.tasks.some(
          (task: { title: string }) => task.title === "Browser-only mission",
        );
      })
      .toBeTruthy();
    await expect(page.locator(".sync-connected")).toContainText(
      "Synced with laptop",
    );
    await page
      .getByRole("button", { name: "Disconnect this device", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Browser-only mission" }),
    ).toBeVisible();
    expect((await device.request.get("/api/sync/workspace")).status()).toBe(
      401,
    );
    await device.close();
  });

  test("re-pairing an invalid session retains queued edits", async ({
    browser,
  }) => {
    const device = await browser.newContext({
      baseURL: "http://127.0.0.1:3000",
    });
    await device.request.post("/api/sync/session", {
      data: { code: code(), role: "controller" },
    });
    const page = await device.newPage();
    await page.goto("/");
    await page.locator(".sync-controls summary").click();
    await expect(page.locator(".sync-connected")).toBeVisible();
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key: string, value: string) {
        if (this === sessionStorage)
          throw new DOMException("Full", "QuotaExceededError");
        return original.call(this, key, value);
      };
    });
    await page.route("**/api/sync/workspace", (route) => route.abort());
    await page
      .getByRole("button", { name: "New mission", exact: true })
      .click();
    await page.getByLabel("Mission title").fill("Retained after re-pair");
    await page.getByRole("button", { name: "Create demo mission" }).click();
    await expect(page.locator(".sync-connected")).toContainText("Offline");
    await expect(
      page.getByRole("alert", { name: "Device synchronization error" }),
    ).toContainText("cannot retain unsent edits after reload");
    await device.addCookies([
      {
        name: "gw_sync_session",
        value: "expired",
        domain: "127.0.0.1",
        path: "/api/sync",
        httpOnly: true,
        sameSite: "Strict",
      },
    ]);
    await page.unroute("**/api/sync/workspace");
    await expect(
      page.getByRole("button", { name: "Re-pair this device", exact: true }),
    ).toBeVisible({ timeout: 10000 });
    await page.getByLabel("Laptop pairing code").fill(code());
    await page
      .getByRole("button", { name: "Re-pair this device", exact: true })
      .click();
    await expect
      .poll(async () => {
        const latest = await (
          await admin.request.get("/api/sync/workspace")
        ).json();
        return latest.workspace.tasks.some(
          (task: { title: string }) => task.title === "Retained after re-pair",
        );
      })
      .toBeTruthy();
    await device.close();
  });

  test("rotating the host pairing configuration invalidates existing sessions without deleting workspace", async () => {
    const file = path.join(root(), "sync-config.json"),
      original = readFileSync(file, "utf8");
    const before = await (
      await admin.request.get("/api/sync/workspace")
    ).json();
    try {
      execFileSync(process.execPath, ["scripts/sync-setup.mjs", "--rotate"], {
        env: { ...process.env, GW_SYNC_DATA_DIR: root() },
        stdio: ["ignore", "pipe", "pipe"],
      });
      expect((await admin.request.get("/api/sync/workspace")).status()).toBe(
        401,
      );
      expect(
        JSON.parse(readFileSync(path.join(root(), "workspace.json"), "utf8")),
      ).toEqual(before);
    } finally {
      writeFileSync(file, original, { mode: 0o600 });
    }
    expect((await admin.request.get("/api/sync/workspace")).status()).toBe(200);
  });
});
