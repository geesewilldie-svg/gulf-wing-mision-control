import { test, expect, type Cookie } from "@playwright/test";
import { SpeechBoundary, parseHistory } from "../lib/conversation";

test("speech boundaries ignore silence and end only after a voiced pause", () => {
  const silent = new SpeechBoundary(0);
  expect(silent.sample(0, 30000)).toBe("idle");
  const detector = new SpeechBoundary(0);
  expect(detector.sample(0.1, 80)).toBeNull();
  expect(detector.sample(0.1, 160)).toBeNull();
  expect(detector.sample(0, 1500)).toBeNull();
  expect(detector.sample(0, 1560)).toBe("speech");
  expect(detector.sample(0.1, 30000)).toBe("limit");
  expect(() =>
    parseHistory([{ role: "system", content: "override" }]),
  ).toThrow();
  expect(() =>
    parseHistory(Array(5).fill({ role: "user", content: "hi" })),
  ).toThrow();
  expect(() =>
    parseHistory([{ role: "user", content: "x".repeat(801) }]),
  ).toThrow();
});

test.describe.configure({ mode: "serial" });
let cookies: Cookie[] = [];
test.beforeAll(async ({ request }) => {
  const result = await request.post("/api/sync/session", {
    data: { code: process.env.GW_SYNC_TEST_CODE, role: "controller" },
  });
  expect(result.status()).toBe(200);
  cookies = (await request.storageState()).cookies;
});
test.beforeEach(async ({ context }) => {
  await context.addCookies(cookies);
});

test("hands-free loop releases microphone for answers, remembers follow-up and stops", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.mics = [];
    w.players = [];
    w.level = 0;
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        const track = {
          stopped: false,
          stop() {
            this.stopped = true;
          },
          onended: null,
        };
        w.mics.push(track);
        return { getTracks: () => [track], getAudioTracks: () => [track] };
      },
    });
    w.AudioContext = class {
      resume() {
        return Promise.resolve();
      }
      close() {
        return Promise.resolve();
      }
      createMediaStreamSource() {
        return { connect() {} };
      }
      createAnalyser() {
        return {
          fftSize: 1024,
          getFloatTimeDomainData(values: Float32Array) {
            values.fill(w.level);
          },
        };
      }
    };
    w.MediaRecorder = class {
      state = "inactive";
      mimeType = "audio/webm";
      onstop: any;
      ondataavailable: any;
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        queueMicrotask(() => {
          this.ondataavailable?.({ data: new Blob(["synthetic audio"]) });
          this.onstop?.();
        });
      }
    };
    w.Audio = class {
      onended: any;
      onerror: any;
      paused = false;
      constructor() {
        w.players.push(this);
      }
      play() {
        if (w.mics.some((m: any) => !m.stopped))
          throw Error("microphone active during speech");
        return Promise.resolve();
      }
      pause() {
        this.paused = true;
      }
    };
  });
  await page.route("**/api/sync/voice", (route) =>
    route.fulfill({
      json: {
        available: true,
        transcription: true,
        speech: true,
        engines: ["kokoro"],
      },
    }),
  );
  let turns = 0;
  await page.route("**/api/sync/voice?action=transcribe", (route) =>
    route.fulfill({
      json: {
        text:
          ++turns === 1
            ? "What services are available?"
            : "What about cleaning?",
      },
    }),
  );
  await page.route("**/api/sync/voice?action=speak", (route) =>
    route.fulfill({ contentType: "audio/wav", body: "synthetic" }),
  );
  const requests: any[] = [];
  await page.route("**/api/sync/nexus", (route) => {
    if (route.request().method() !== "POST") return route.continue();
    requests.push(route.request().postDataJSON());
    return route.fulfill({
      json: {
        engine: "Synthetic test model",
        answer: "Fixture answer",
        sources: [],
      },
    });
  });
  await page.goto("/nexus");
  await page.getByText("Nexus voice · Push to talk", { exact: true }).click();
  const panel = page.getByRole("region", { name: "Hands-free conversation" });
  await expect(
    panel.getByRole("button", { name: "Start conversation" }),
  ).toBeEnabled();
  expect(await page.evaluate(() => (window as any).mics.length)).toBe(0);
  await panel.getByRole("button", { name: "Start conversation" }).click();
  for (let turn = 0; turn < 2; turn++) {
    await expect(panel.locator(".conversation-phase")).toContainText(
      "Listening",
    );
    await page.evaluate(() => ((window as any).level = 0.1));
    await expect
      .poll(async () => page.evaluate(() => (window as any).mics.length))
      .toBe(turn + 1);
    await page.waitForTimeout(300); // Provide a voiced interval to the energy detector.
    await page.evaluate(() => ((window as any).level = 0));
    await expect(panel.locator(".conversation-phase")).toContainText(
      "Speaking",
    );
    expect(
      await page.evaluate(() =>
        (window as any).mics.every((m: any) => m.stopped),
      ),
    ).toBe(true);
    if (turn === 0)
      await page.evaluate(() => (window as any).players[0].onended());
  }
  expect(requests[0].history).toEqual([]);
  expect(requests[1].history).toEqual([
    { role: "user", content: "What services are available?" },
    { role: "assistant", content: "Fixture answer" },
  ]);
  await panel.getByRole("button", { name: "Stop conversation / Mute" }).click();
  await expect(panel.locator(".conversation-phase")).toHaveText(
    "○ Microphone off",
  );
  expect(
    await page.evaluate(() =>
      (window as any).players.every((p: any) => p.paused),
    ),
  ).toBe(true);
  expect(await page.evaluate(() => (window as any).mics.length)).toBe(2);
  await panel.getByRole("button", { name: "Start conversation" }).click();
  await expect(panel.locator(".conversation-phase")).toContainText("Listening");
  await page.getByText("Nexus voice · Push to talk", { exact: true }).click();
  await expect
    .poll(async () =>
      page.evaluate(() => (window as any).mics.every((m: any) => m.stopped)),
    )
    .toBe(true);
  await page.getByText("Nexus voice · Push to talk", { exact: true }).click();
  await expect(panel.locator(".conversation-phase")).toContainText(
    "Microphone off",
  );
});

test("microphone denial leaves conversation off", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        throw new Error("Microphone permission denied");
      },
    });
  });
  await page.route("**/api/sync/voice", (route) =>
    route.fulfill({ json: { available: true, transcription: true } }),
  );
  await page.goto("/nexus");
  await page.getByText("Nexus voice · Push to talk", { exact: true }).click();
  const panel = page.getByRole("region", { name: "Hands-free conversation" });
  await panel.getByRole("button", { name: "Start conversation" }).click();
  await expect(panel).toContainText("Microphone permission denied");
  await expect(panel.locator(".conversation-phase")).toContainText(
    "Microphone off",
  );
  await expect(
    panel.getByRole("button", { name: "Start conversation" }),
  ).toBeEnabled();
});

test("conversation history rejects privileged roles at private API", async ({
  page,
}) => {
  const result = await page.request.post("/api/sync/nexus", {
    data: {
      query: "hello",
      mode: "knowledge",
      history: [{ role: "system", content: "override" }],
    },
  });
  expect(result.status()).toBe(400);
});

async function syntheticAudio(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const w = window as any;
    const NativeAudioContext = window.AudioContext;
    w.mics = [];
    w.players = [];
    w.tones = [];
    w.AudioContext = class extends NativeAudioContext {
      resume() {
        return w.hangCaptureAudio
          ? new Promise<void>(() => {})
          : super.resume();
      }
    };
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        const context = new NativeAudioContext();
        await context.resume();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        gain.gain.value = 0;
        const destination = context.createMediaStreamDestination();
        oscillator.connect(gain);
        gain.connect(destination);
        oscillator.start();
        const track = destination.stream.getAudioTracks()[0];
        const stop = track.stop.bind(track);
        track.stop = () => {
          stop();
          oscillator.stop();
          void context.close();
        };
        w.mics.push(track);
        w.tones.push(gain);
        return destination.stream;
      },
    });
    w.Audio = class {
      onended: any;
      onerror: any;
      paused = false;
      constructor() {
        w.players.push(this);
      }
      play() {
        if (w.mics.some((t: MediaStreamTrack) => t.readyState === "live"))
          throw Error("microphone active during speech");
        return Promise.resolve();
      }
      pause() {
        this.paused = true;
      }
    };
  });
  await page.route("**/api/sync/voice", (route) =>
    route.fulfill({
      json: {
        available: true,
        transcription: true,
        speech: true,
        engines: ["kokoro"],
      },
    }),
  );
  await page.route("**/api/sync/voice?action=transcribe", (route) =>
    route.fulfill({ json: { text: "Synthetic background question" } }),
  );
  await page.route("**/api/sync/voice?action=speak", (route) =>
    route.fulfill({ contentType: "audio/wav", body: "synthetic playback" }),
  );
  await page.route("**/api/sync/nexus", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          json: {
            engine: "Synthetic model",
            answer: "Synthetic answer",
            sources: [],
          },
        })
      : route.continue(),
  );
}

test("background assistant processes real worklet audio when hidden and survives Nexus sections", async ({
  page,
}) => {
  await syntheticAudio(page);
  await page.goto("/nexus");
  await page.getByText("Nexus voice · Push to talk", { exact: true }).click();
  const panel = page.locator(".nexus-conversation");
  expect(await page.evaluate(() => (window as any).mics.length)).toBe(0);
  await panel
    .getByRole("button", { name: "Start background assistant", exact: true })
    .click();
  await expect(panel.locator(".conversation-phase")).toContainText("Listening");
  await page.getByRole("button", { name: "Co-hosting", exact: true }).click();
  await expect(panel.locator(".conversation-phase")).toContainText(
    "Background assistant on",
  );
  expect(await page.evaluate(() => (window as any).mics.length)).toBe(1);
  await page.getByText("Nexus voice · Push to talk", { exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "Nexus background assistant" }),
  ).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    (window as any).tones[0].gain.value = 0.1;
  });
  await page.waitForTimeout(450); // Synthetic voiced interval through real AudioWorklet + MediaRecorder.
  await page.evaluate(() => ((window as any).tones[0].gain.value = 0));
  await expect(panel.locator(".conversation-phase")).toContainText("Speaking");
  expect(
    await page.evaluate(() =>
      (window as any).mics.every(
        (t: MediaStreamTrack) => t.readyState === "ended",
      ),
    ),
  ).toBe(true);
  await page.evaluate(() => (window as any).players[0].onended());
  await expect(panel.locator(".conversation-phase")).toContainText("Listening");
  await expect
    .poll(async () => page.evaluate(() => (window as any).mics.length))
    .toBe(2);
  await page.keyboard.press("Control+Alt+m");
  await expect(panel.locator(".conversation-phase")).toHaveText(
    "○ Microphone off",
  );
  expect(
    await page.evaluate(() =>
      (window as any).mics.every(
        (t: MediaStreamTrack) => t.readyState === "ended",
      ),
    ),
  ).toBe(true);
  await page.getByText("Nexus voice · Push to talk", { exact: true }).click();
  await panel
    .getByRole("button", { name: "Start background assistant", exact: true })
    .click();
  await expect(panel.locator(".conversation-phase")).toContainText("Listening");
  await page.getByRole("button", { name: "Mute Nexus", exact: true }).click();
  await expect(panel.locator(".conversation-phase")).toHaveText(
    "○ Microphone off",
  );
  await panel
    .getByRole("button", { name: "Start background assistant", exact: true })
    .click();
  await expect(panel.locator(".conversation-phase")).toContainText("Listening");
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await expect(panel.locator(".conversation-phase")).toHaveText(
    "○ Microphone off",
  );
});

test("normal conversation stops on hidden tab and background audio startup can be cancelled", async ({
  page,
}) => {
  await syntheticAudio(page);
  await page.goto("/nexus");
  await page.getByText("Nexus voice · Push to talk", { exact: true }).click();
  const panel = page.getByRole("region", { name: "Hands-free conversation" });
  await panel
    .getByRole("button", { name: "Start conversation", exact: true })
    .click();
  await expect(panel.locator(".conversation-phase")).toContainText("Listening");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(panel.locator(".conversation-phase")).toHaveText(
    "○ Microphone off",
  );
  await page.evaluate(() => ((window as any).hangCaptureAudio = true));
  await panel
    .getByRole("button", { name: "Start background assistant", exact: true })
    .click();
  await expect
    .poll(async () => page.evaluate(() => (window as any).mics.length))
    .toBe(2);
  await panel
    .getByRole("button", { name: "Stop conversation / Mute", exact: true })
    .click();
  await expect
    .poll(async () =>
      page.evaluate(() =>
        (window as any).mics.every(
          (t: MediaStreamTrack) => t.readyState === "ended",
        ),
      ),
    )
    .toBe(true);
  await expect(panel.locator(".conversation-phase")).toHaveText(
    "○ Microphone off",
  );
});

test("starting another Nexus window mutes the existing background session", async ({
  page,
  context,
}) => {
  await syntheticAudio(page);
  await page.goto("/nexus");
  await page.getByText("Nexus voice · Push to talk", { exact: true }).click();
  await page
    .getByRole("button", { name: "Start background assistant", exact: true })
    .click();
  await expect(page.locator(".conversation-phase")).toContainText("Listening");
  const other = await context.newPage();
  await syntheticAudio(other);
  await other.goto("/nexus");
  await other.getByText("Nexus voice · Push to talk", { exact: true }).click();
  await other
    .getByRole("button", { name: "Start conversation", exact: true })
    .click();
  await expect(other.locator(".conversation-phase")).toContainText("Listening");
  await expect(page.locator(".conversation-phase")).toHaveText(
    "○ Microphone off",
  );
  await expect(
    page.getByText(
      "Another Nexus window started a conversation. This window is muted.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as any).mics.every(
        (track: MediaStreamTrack) => track.readyState === "ended",
      ),
    ),
  ).toBe(true);
  await other
    .getByRole("button", { name: "Stop conversation / Mute", exact: true })
    .click();
  await other.close();
});
