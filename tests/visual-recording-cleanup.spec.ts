import { test, expect } from "@playwright/test";
import { fixtureRole } from "./helpers/access";
import { mediaFixture } from "./helpers/capture";
async function open(page: import("@playwright/test").Page) {
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
  const panel = page.getByRole("region", {
    name: "Record a visual question",
    exact: true,
  });
  await panel
    .getByRole("button", { name: "Record visual question", exact: true })
    .click();
  await expect(panel).toContainText("microphone on");
  return panel;
}
test("hidden pages and another conversation discard recording and release tracks without uploading", async ({
  page,
  context,
}) => {
  await fixtureRole(context);
  await mediaFixture(page, "voice");
  let uploads = 0;
  await page.route("**/api/sync/voice?action=transcribe", (route) => {
    uploads++;
    return route.abort();
  });
  let panel = await open(page);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(panel).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      (window as any).__capture.tracks.map(
        (t: MediaStreamTrack) => t.readyState,
      ),
    ),
  ).toEqual(["ended", "ended"]);
  panel = await open(page);
  await page.evaluate(() => {
    const ch = new BroadcastChannel("gulf-wing-nexus-conversation");
    ch.postMessage("started");
    ch.close();
  });
  await expect(panel).toContainText("another Nexus conversation started");
  expect(
    await page.evaluate(
      () => (window as any).__capture.tracks.at(-1).readyState,
    ),
  ).toBe("ended");
  expect(uploads).toBe(0);
});
for (const mode of ["voice-empty", "voice-large"]) {
  test(`${mode}: recording output is discarded without upload or typed-input replacement`, async ({
    page,
    context,
  }) => {
    await fixtureRole(context);
    await mediaFixture(page, mode);
    let uploads = 0;
    await page.route("**/api/sync/voice?action=transcribe", (route) => {
      uploads++;
      return route.abort();
    });
    const panel = await open(page);
    await panel
      .getByRole("button", {
        name: "Stop and transcribe question",
        exact: true,
      })
      .click();
    await expect(panel).toContainText(
      mode === "voice-large"
        ? "exceeded its size limit"
        : "No audio was captured",
    );
    await expect(
      page.getByRole("textbox", {
        name: "Question about this frame",
        exact: true,
      }),
    ).not.toHaveValue("");
    expect(uploads).toBe(0);
  });
}
test("microphone track release survives recorder stop errors", async ({
  page,
  context,
}) => {
  await fixtureRole(context);
  await mediaFixture(page, "voice-stop-error");
  let panel = await open(page);
  await panel
    .getByRole("button", { name: "Cancel visual recording", exact: true })
    .click();
  await expect(
    panel.getByRole("button", { name: "Record visual question", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => (window as any).__capture.tracks.at(-1).readyState,
    ),
  ).toBe("ended");
  await panel
    .getByRole("button", { name: "Record visual question", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Stop and transcribe question", exact: true })
    .click();
  await expect(panel).toContainText("Recording failed while stopping");
  expect(
    await page.evaluate(
      () => (window as any).__capture.tracks.at(-1).readyState,
    ),
  ).toBe("ended");
});
