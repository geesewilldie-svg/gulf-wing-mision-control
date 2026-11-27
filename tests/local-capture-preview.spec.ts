import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import { fixtureRole } from "./helpers/access";
import { mediaFixture } from "./helpers/capture";
async function open(page: Page) {
  await page.goto("/nexus");
  await page
    .getByRole("navigation", { name: "Nexus sections" })
    .getByRole("button", { name: "Connections", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Connection categories" })
    .getByRole("button", { name: "Camera and screen", exact: true })
    .click();
  return page.getByRole("region", {
    name: "Local camera and screen preview",
    exact: true,
  });
}
const state = (page: Page) =>
  page.evaluate(() => {
    const f = (window as any).__capture;
    return {
      calls: f.calls,
      tracks: f.tracks.map((t: MediaStreamTrack) => t.readyState),
    };
  });
test("camera and screen are explicit video-only previews, stop all tracks and retain no video", async ({
  page,
  context,
}, info) => {
  await fixtureRole(context);
  await mediaFixture(page);
  let frameUploads = 0;
  page.on("request", (request) => {
    const type = request.headers()["content-type"] || "";
    if (/video|image|multipart|octet-stream/.test(type)) frameUploads++;
  });
  const panel = await open(page);
  expect((await state(page)).calls).toEqual([]);
  await panel
    .getByRole("button", { name: "Start camera preview", exact: true })
    .click();
  await expect(
    panel.getByText("Capture state: camera preview active", { exact: false }),
  ).toBeVisible();
  await expect(panel.locator("video")).toBeVisible();
  await expect(
    panel.getByRole("button", {
      name: "Choose screen to preview",
      exact: true,
    }),
  ).toBeDisabled();
  const snapshot = await state(page);
  expect(snapshot.calls).toHaveLength(1);
  expect(snapshot.calls[0].options.audio).toBe(false);
  await fs.mkdir("artifacts/local-capture-preview", { recursive: true });
  await panel.screenshot({
    path: `artifacts/local-capture-preview/${info.project.name}.png`,
  });
  expect(
    await panel.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await panel
    .getByRole("button", { name: "Stop capture", exact: true })
    .click();
  await expect(panel.locator("video")).toBeHidden();
  expect((await state(page)).tracks).toEqual(["ended"]);
  expect(
    await panel
      .locator("video")
      .evaluate((v) => (v as HTMLVideoElement).srcObject),
  ).toBeNull();
  await panel
    .getByRole("button", { name: "Choose screen to preview", exact: true })
    .click();
  await expect(
    panel.getByText("Capture state: screen preview active", { exact: false }),
  ).toBeVisible();
  expect((await state(page)).calls[1]).toEqual({
    kind: "screen",
    options: { video: { frameRate: 15 }, audio: false },
  });
  await page
    .getByRole("navigation", { name: "Connection categories" })
    .getByRole("button", { name: "Google accounts", exact: true })
    .click();
  expect((await state(page)).tracks).toEqual(["ended", "ended"]);
  expect(frameUploads).toBe(0);
});
test("permission denial never accepts a preview or exposes raw errors", async ({
  page,
  context,
}) => {
  await fixtureRole(context);
  await mediaFixture(page, "deny");
  const panel = await open(page);
  await panel
    .getByRole("button", { name: "Start camera preview", exact: true })
    .click();
  await expect(
    panel.getByText(
      "Capture was denied, cancelled or unavailable. No preview was accepted.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(panel).not.toContainText("PRIVATE");
  await expect(panel.locator("video")).toBeHidden();
  await expect(
    panel.getByRole("button", { name: "Start camera preview", exact: true }),
  ).toBeEnabled();
});
test("unsupported browser capabilities remain unavailable", async ({
  page,
  context,
}) => {
  await fixtureRole(context);
  await mediaFixture(page, "unsupported");
  await open(page);
  const current = page.getByRole("region", {
    name: "Local camera and screen preview",
    exact: true,
  });
  await expect(
    current.getByRole("button", { name: "Start camera preview", exact: true }),
  ).toBeDisabled();
  await expect(
    current.getByRole("button", {
      name: "Choose screen to preview",
      exact: true,
    }),
  ).toBeDisabled();
});
test("cancelled and expired chooser requests reject late streams and block overlapping requests", async ({
  page,
  context,
}) => {
  await fixtureRole(context);
  await mediaFixture(page, "pending");
  let panel = await open(page);
  await panel
    .getByRole("button", { name: "Choose screen to preview", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Stop capture", exact: true })
    .click();
  await expect(
    panel.getByRole("button", { name: "Start camera preview", exact: true }),
  ).toBeDisabled();
  await page.evaluate(() => (window as any).__capture.release());
  await expect(
    panel.getByText("Capture is off. The late browser stream was stopped.", {
      exact: true,
    }),
  ).toBeVisible();
  expect((await state(page)).tracks).toEqual(["ended"]);
  await page.clock.install();
  await panel
    .getByRole("button", { name: "Start camera preview", exact: true })
    .click();
  await page.clock.fastForward(20001);
  await expect(panel).toContainText(
    "Capture request expired after 20 seconds.",
  );
  await expect(
    panel.getByRole("button", {
      name: "Choose screen to preview",
      exact: true,
    }),
  ).toBeDisabled();
  await page.evaluate(() => (window as any).__capture.release());
  await expect(
    panel.getByRole("button", { name: "Start camera preview", exact: true }),
  ).toBeEnabled();
  expect((await state(page)).tracks).toEqual(["ended", "ended"]);
});
test("leaving the view while permission is pending stops a subsequently delivered stream", async ({
  page,
  context,
}) => {
  await fixtureRole(context);
  await mediaFixture(page, "pending");
  const panel = await open(page);
  await panel
    .getByRole("button", { name: "Start camera preview", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Nexus sections" })
    .getByRole("button", { name: "Overview", exact: true })
    .click();
  await page.evaluate(() => (window as any).__capture.release());
  await expect.poll(async () => (await state(page)).tracks).toEqual(["ended"]);
});
test("hidden page, ended or muted track and preview timeout stop capture without auto-resume", async ({
  page,
  context,
}) => {
  await fixtureRole(context);
  await mediaFixture(page);
  const panel = await open(page);
  for (const trigger of ["hidden", "ended", "mute", "pagehide", "timeout"]) {
    if (trigger === "timeout") await page.clock.install();
    await panel
      .getByRole("button", { name: "Start camera preview", exact: true })
      .click();
    await expect(panel.locator("video")).toBeVisible();
    if (trigger === "hidden")
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          value: "hidden",
        });
        document.dispatchEvent(new Event("visibilitychange"));
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          value: "visible",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
    else if (trigger === "pagehide")
      await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    else if (trigger === "timeout") await page.clock.fastForward(60001);
    else
      await page.evaluate(
        (event) =>
          (window as any).__capture.tracks
            .at(-1)
            .dispatchEvent(new Event(event)),
        trigger,
      );
    await expect(panel.locator("video")).toBeHidden();
    expect((await state(page)).tracks.every((s: string) => s === "ended")).toBe(
      true,
    );
    await expect(
      panel.getByRole("button", { name: "Start camera preview", exact: true }),
    ).toBeEnabled();
  }
  expect((await state(page)).calls).toHaveLength(5);
});
test("unexpected audio stream is rejected and every track is stopped", async ({
  page,
  context,
}) => {
  await fixtureRole(context);
  await mediaFixture(page, "audio");
  const panel = await open(page);
  await panel
    .getByRole("button", { name: "Start camera preview", exact: true })
    .click();
  await expect(panel).toContainText("No preview was accepted.");
  expect((await state(page)).tracks).toEqual(["ended"]);
  await expect(panel.locator("video")).toBeHidden();
});
test("display-only devices cannot start the app preview", async ({
  page,
  context,
}) => {
  await fixtureRole(context, "display");
  await mediaFixture(page);
  const panel = await open(page);
  await expect(
    panel.getByRole("button", { name: "Start camera preview", exact: true }),
  ).toBeDisabled();
  await expect(
    panel.getByRole("button", {
      name: "Choose screen to preview",
      exact: true,
    }),
  ).toBeDisabled();
  expect((await state(page)).calls).toEqual([]);
});
