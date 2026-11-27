import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import { fixtureRole } from "./helpers/access";
import { mediaFixture } from "./helpers/capture";
import { DEFAULT_FRAME_QUESTION } from "../lib/local-frame-analysis";
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
  await page
    .getByRole("button", { name: "Start camera preview", exact: true })
    .click();
  return page.getByRole("region", {
    name: "Record a visual question",
    exact: true,
  });
}
async function setup(
  page: Page,
  context: import("@playwright/test").BrowserContext,
  mode = "voice",
) {
  await fixtureRole(context);
  await mediaFixture(page, mode);
  await page.route("**/api/sync/agents", (route) =>
    route.fulfill({
      json: { providers: [], events: [], workers: [], obsidian: false },
    }),
  );
}
test("recording stops the microphone, requires transcript review and never submits an image automatically", async ({
  page,
  context,
}, info) => {
  await setup(page, context);
  let audio = 0,
    images = 0;
  await page.route("**/api/sync/vision", (route) => {
    images++;
    return route.abort();
  });
  await page.route("**/api/sync/voice?action=transcribe", (route) => {
    audio++;
    expect(route.request().headers()["content-type"]).toBe("audio/webm");
    expect(route.request().postDataBuffer()?.toString()).toBe(
      "owned audio fixture",
    );
    return route.fulfill({ json: { text: " What color is this button? " } });
  });
  const panel = await open(page),
    question = page.getByRole("textbox", {
      name: "Question about this frame",
      exact: true,
    });
  expect(audio).toBe(0);
  await panel
    .getByRole("button", { name: "Record visual question", exact: true })
    .click();
  await expect(panel).toContainText("microphone on");
  await expect(question).toBeDisabled();
  await panel
    .getByRole("button", { name: "Stop and transcribe question", exact: true })
    .click();
  await expect(
    panel.getByRole("region", {
      name: "Visual question transcript",
      exact: true,
    }),
  ).toContainText("What color is this button?");
  await expect(question).toHaveValue(DEFAULT_FRAME_QUESTION);
  expect(audio).toBe(1);
  expect(images).toBe(0);
  const tracks = await page.evaluate(() =>
    (window as any).__capture.tracks.map((t: MediaStreamTrack) => t.readyState),
  );
  expect(tracks).toEqual(["live", "ended"]);
  expect(
    await panel.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await fs.mkdir("artifacts/visual-question-recorder", { recursive: true });
  await panel.screenshot({
    path: `artifacts/visual-question-recorder/${info.project.name}.png`,
  });
  await panel
    .getByRole("button", { name: "Use transcript as question", exact: true })
    .click();
  await expect(question).toHaveValue("What color is this button?");
  expect(images).toBe(0);
});
test("cancelled and late microphone permissions cannot upload audio or alter the typed question", async ({
  page,
  context,
}) => {
  await setup(page, context, "voice-pending");
  let audio = 0;
  await page.route("**/api/sync/voice?action=transcribe", (route) => {
    audio++;
    return route.fulfill({ json: { text: "late" } });
  });
  const panel = await open(page);
  await panel
    .getByRole("button", { name: "Record visual question", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Cancel visual recording", exact: true })
    .click();
  await expect(
    panel.getByRole("button", { name: "Record visual question", exact: true }),
  ).toBeDisabled();
  await page.evaluate(() => (window as any).__capture.release());
  await expect(
    panel.getByRole("button", { name: "Record visual question", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => (window as any).__capture.tracks.at(-1).readyState,
    ),
  ).toBe("ended");
  expect(audio).toBe(0);
});
test("cancelled transcription, capture stop and hidden views discard late transcripts", async ({
  page,
  context,
}) => {
  await setup(page, context);
  let release!: () => void,
    audio = 0;
  const waiting = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/sync/voice?action=transcribe", async (route) => {
    audio++;
    await waiting;
    await route.fulfill({ json: { text: "Late transcript" } }).catch(() => {});
  });
  const panel = await open(page);
  await panel
    .getByRole("button", { name: "Record visual question", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Stop and transcribe question", exact: true })
    .click();
  await expect.poll(() => audio).toBe(1);
  await page.getByRole("button", { name: "Stop capture", exact: true }).click();
  release();
  await expect(panel).toHaveCount(0);
  await expect(page.getByText("Late transcript", { exact: true })).toHaveCount(
    0,
  );
});
test("local transcription errors or oversized text preserve the typed question without truncation or retry", async ({
  page,
  context,
}) => {
  await setup(page, context);
  let audio = 0;
  await page.route("**/api/sync/voice?action=transcribe", (route) => {
    audio++;
    return route.fulfill({ json: { text: "x".repeat(1001) } });
  });
  const panel = await open(page);
  await panel
    .getByRole("button", { name: "Record visual question", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Stop and transcribe question", exact: true })
    .click();
  await expect(panel).toContainText("oversized or unsupported question");
  expect(audio).toBe(1);
  await expect(
    page.getByRole("textbox", {
      name: "Question about this frame",
      exact: true,
    }),
  ).toHaveValue(DEFAULT_FRAME_QUESTION);
  await expect(
    panel.getByRole("button", {
      name: "Use transcript as question",
      exact: true,
    }),
  ).toHaveCount(0);
});
test("recording limit stops and transcribes once; discarding the draft keeps typed input", async ({
  page,
  context,
}) => {
  await setup(page, context);
  await page.clock.install();
  let audio = 0;
  await page.route("**/api/sync/voice?action=transcribe", (route) => {
    audio++;
    return route.fulfill({ json: { text: "What is visible?" } });
  });
  const panel = await open(page);
  await panel
    .getByRole("button", { name: "Record visual question", exact: true })
    .click();
  await expect(panel).toContainText("microphone on");
  await page.clock.fastForward(10001);
  await expect(
    panel.getByRole("button", {
      name: "Use transcript as question",
      exact: true,
    }),
  ).toBeVisible();
  expect(audio).toBe(1);
  await panel
    .getByRole("button", { name: "Discard question transcript", exact: true })
    .click();
  await expect(
    panel.getByRole("region", {
      name: "Visual question transcript",
      exact: true,
    }),
  ).toHaveCount(0);
});
test("denied microphone does not submit anything", async ({
  page,
  context,
}) => {
  await setup(page, context, "voice-deny");
  let audio = 0;
  await page.route("**/api/sync/voice?action=transcribe", (route) => {
    audio++;
    return route.abort();
  });
  const panel = await open(page);
  await panel
    .getByRole("button", { name: "Record visual question", exact: true })
    .click();
  await expect(panel).toContainText("permission was denied");
  expect(audio).toBe(0);
});
