import { test, expect } from "@playwright/test";
import { fixtureRole } from "./helpers/access";
import { openAssistant } from "./helpers/assistant";

test("Stephanie requires explicit cloud sharing and never falls back after provider failure", async ({
  page,
  context,
}) => {
  await fixtureRole(context);
  await page.addInitScript(() => {
    (window as any).Audio = class {
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      play() {
        setTimeout(() => this.onended?.(), 5);
        return Promise.resolve();
      }
      pause() {}
    };
  });
  let cloudCalls: any[] = [],
    localCalls = 0,
    fail = false;
  await page.route("**/api/sync/voice**", async (route) => {
    if (route.request().method() === "POST") {
      localCalls++;
      return route.fulfill({ contentType: "audio/wav", body: "synthetic" });
    }
    return route.fulfill({
      json: {
        available: true,
        speech: true,
        transcription: true,
        engines: ["kokoro", "piper"],
      },
    });
  });
  await page.route("**/api/sync/elevenlabs", async (route) => {
    if (route.request().method() === "POST") {
      cloudCalls.push(route.request().postDataJSON());
      return fail
        ? route.fulfill({
            status: 503,
            json: { error: "ElevenLabs quota reached. No retry." },
          })
        : route.fulfill({ contentType: "audio/mpeg", body: "synthetic" });
    }
    return route.fulfill({
      json: {
        configured: true,
        enabled: route.request().method() !== "DELETE",
        supported: true,
        voiceName: "Stephanie",
        dailyCharacters: 1000,
        usedCharacters: 0,
      },
    });
  });
  await page.goto("/nexus");
  await openAssistant(page);
  await page.getByText("Nexus voice · Push to talk", { exact: true }).click();
  const select = page.getByLabel("Speech engine", { exact: true });
  await expect(select).toHaveValue("auto");
  expect(cloudCalls).toEqual([]);
  await select.selectOption("elevenlabs");
  const consent = page.getByLabel(/Allow cloud speech with Stephanie/);
  await expect(consent).not.toBeChecked();
  const preview = page.getByRole("button", {
    name: "Speak voice preview",
    exact: true,
  });
  await expect(preview).toBeDisabled();
  await expect(
    page.getByRole("button", {
      name: "Start background assistant",
      exact: true,
    }),
  ).toBeDisabled();
  await consent.check();
  await preview.click();
  await expect(
    page.getByRole("status").filter({ hasText: "Speech finished." }),
  ).toBeVisible();
  expect(cloudCalls).toHaveLength(1);
  expect(cloudCalls[0]).toEqual({
    text: "Hello. I'm Nexus, your Gulf Wing business assistant. How can I help?",
    cloudSpeechConsent: true,
  });
  expect(localCalls).toBe(0);
  fail = true;
  await preview.click();
  await expect(
    page.getByRole("status").filter({ hasText: "ElevenLabs quota reached" }),
  ).toBeVisible();
  expect(cloudCalls).toHaveLength(2);
  expect(localCalls).toBe(0);
  await page
    .getByText("ElevenLabs voice setup · Stephanie", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Disable ElevenLabs", exact: true })
    .click();
  await expect(select).toHaveValue("auto");
  await select.selectOption("piper");
  await select.selectOption("auto");
  await page.reload();
  await openAssistant(page);
  expect(cloudCalls).toHaveLength(2);
});
