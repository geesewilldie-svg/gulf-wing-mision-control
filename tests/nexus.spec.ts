import { test, expect } from "@playwright/test";
const documents = [
  {
    id: "cohosting-test",
    source: "Test business plan",
    location: "Page 2",
    text: "Co-hosting provides cleaning and property readiness. Forecast only; no actual revenue.",
  },
  {
    id: "marketing-test",
    source: "Test methodology",
    location: "Page 5",
    text: "Marketing planning allowance is $500 monthly. It is not authorized advertising spend.",
  },
];
test.describe("Nexus private business foundation", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeEach(async ({ page }) => {
    await page.request.post("/api/sync/session", {
      data: { code: process.env.GW_SYNC_TEST_CODE, role: "controller" },
    });
  });
  test("knowledge requires pairing, validates input, and returns cited excerpts", async ({
    page,
    playwright,
  }) => {
    const anonymous = await playwright.request.newContext({
      baseURL: "http://127.0.0.1:3000",
    });
    expect((await anonymous.get("/api/sync/nexus")).status()).toBe(401);
    await anonymous.dispose();
    expect(
      (await page.request.put("/api/sync/nexus", { data: documents })).status(),
    ).toBe(200);
    expect(
      (
        await page.request.put("/api/sync/nexus", {
          data: [documents[0], documents[0]],
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await page.request.put("/api/sync/nexus", {
          data: documents,
          headers: { Origin: "https://example.com" },
        })
      ).status(),
    ).toBe(403);
    const result = await page.request.post("/api/sync/nexus", {
      data: { query: "cleaning", mode: "auto" },
    });
    expect(result.ok()).toBe(true);
    expect(result.headers()["cache-control"]).toBe("no-store");
    const body = await result.json();
    expect(body.engine).toBe("Local document search");
    expect(body.sources[0].source).toBe("Test business plan");
    expect(
      (
        await page.request.post("/api/sync/nexus", {
          data: { query: "cleaning", mode: "unknown" },
        })
      ).status(),
    ).toBe(400);
  });
  test("one-box search, original device voice, connections and import controls work", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const stub = {
        getVoices: () => [],
        addEventListener: () => {},
        removeEventListener: () => {},
        speak: () => {
          (window as unknown as { nexusSpoke: boolean }).nexusSpoke = true;
        },
        cancel: () => {},
      };
      Object.defineProperty(window, "speechSynthesis", {
        value: stub,
        configurable: true,
      });
      Object.defineProperty(window, "SpeechSynthesisUtterance", {
        value: class {
          text: string;
          constructor(text: string) {
            this.text = text;
          }
        },
        configurable: true,
      });
    });
    await page.goto("/nexus");
    await page.getByLabel("Ask Nexus", { exact: true }).fill("cleaning");
    await page
      .locator("form")
      .getByRole("button", { name: "Ask Nexus", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Local document search" }),
    ).toBeVisible();
    await page
      .getByText("[1] Test business plan · Page 2", { exact: true })
      .click();
    await expect(
      page.getByText(documents[0].text, { exact: true }),
    ).toBeVisible();
    await page.getByText("Nexus voice · Push to talk", { exact: true }).click();
    await page
      .getByRole("button", { name: "Speak answer", exact: true })
      .click();
    expect(
      await page.evaluate(
        () => (window as unknown as { nexusSpoke: boolean }).nexusSpoke,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Stop speech", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Connections", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "GitHub Copilot", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "ChatGPT", exact: true }),
    ).toBeVisible();
    expect(
      await page
        .locator(".nexus-connections")
        .getByText("Not connected", { exact: true })
        .count(),
    ).toBeGreaterThanOrEqual(12);
  });
  test("operating records, estimates and proposed marketing budgets save and validate", async ({
    page,
  }, testInfo) => {
    const leadName = `Owner lead ${testInfo.project.name}`;
    await page.goto("/nexus");
    await page.getByRole("button", { name: "Co-hosting", exact: true }).click();
    await page.getByRole("button", { name: "Load business records" }).click();
    await page.getByLabel("Name", { exact: true }).fill(leadName);
    await page.getByRole("button", { name: "Add operating record" }).click();
    await expect(
      page.getByText(`Lead: ${leadName}`, { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Estimate name", { exact: true })
      .fill(`Turnover estimate ${testInfo.project.name}`);
    await page.getByRole("button", { name: "Save draft estimate" }).click();
    await expect(
      page.getByText(
        `Turnover estimate ${testInfo.project.name} · $103.15 before tax · DRAFT`,
        { exact: true },
      ),
    ).toBeVisible();
    const before = await (await page.request.get("/api/sync/business")).json();
    const invalid = await page.request.put("/api/sync/business", {
      data: {
        ...before,
        marketing: { total: 100, meta: 101, google: 0, linkedin: 0 },
      },
    });
    expect(invalid.status()).toBe(400);
    expect(
      (
        await page.request.put("/api/sync/business", {
          data: { ...before, revision: before.revision - 1 },
        })
      ).status(),
    ).toBe(409);
    await page.getByRole("button", { name: "Marketing", exact: true }).click();
    await page.getByRole("button", { name: "Load business records" }).click();
    await page.getByLabel("Meta / Facebook ($)", { exact: true }).fill("100");
    await page
      .getByRole("button", { name: "Save proposed allocation" })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Saved to laptop" }),
    ).toBeVisible();
    const after = await (await page.request.get("/api/sync/business")).json();
    expect(after.marketing.meta).toBe(100);
    expect(after.audit.length).toBeGreaterThan(0);
  });
  test("display sessions cannot import, ask models, record voice or save business data", async ({
    page,
  }) => {
    await page.request.post("/api/sync/session", {
      data: { code: process.env.GW_SYNC_TEST_CODE, role: "display" },
    });
    expect(
      (await page.request.put("/api/sync/nexus", { data: documents })).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post("/api/sync/nexus", {
          data: { query: "cleaning", mode: "auto" },
        })
      ).status(),
    ).toBe(403);
    expect(
      (await page.request.put("/api/sync/business", { data: {} })).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post("/api/sync/voice?action=speak", {
          data: { text: "hello" },
        })
      ).status(),
    ).toBe(403);
    await page.goto("/nexus");
    await expect(
      page
        .locator("form")
        .getByRole("button", { name: "Ask Nexus", exact: true }),
    ).toBeDisabled();
  });
});

test("Nexus fits mobile without pretending to have connected agents", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/nexus");
  await expect(page.getByRole("heading", { name: "Nexus." })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("Isabella is preferred when ready and explicit Piper selection stays selected", async ({
  page,
}) => {
  await page.request.post("/api/sync/session", {
    data: { code: process.env.GW_SYNC_TEST_CODE, role: "controller" },
  });
  const engines: string[] = [];
  await page.route("**/api/sync/voice**", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: {
          available: true,
          speech: true,
          transcription: false,
          engines: ["kokoro", "piper"],
          preferred: "kokoro",
          profile: "Isabella · British English · 0.95",
        },
      });
    engines.push(route.request().postDataJSON().engine);
    return route.fulfill({
      contentType: "audio/wav",
      body: Buffer.from("RIFFfixtureWAVE"),
    });
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, "Audio", {
      configurable: true,
      value: class {
        onended: unknown;
        onerror: unknown;
        play() {
          return Promise.resolve();
        }
        pause() {}
      },
    });
  });
  await page.goto("/nexus");
  await page.getByText("Nexus voice · Push to talk", { exact: true }).click();
  await expect(page.getByText(/Current voice: Isabella/)).toBeVisible();
  await page
    .getByRole("button", { name: "Speak voice preview", exact: true })
    .click();
  await expect.poll(() => engines.length).toBe(1);
  expect(engines[0]).toBe("kokoro");
  await page.getByRole("button", { name: "Stop speech", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Speech engine", exact: true })
    .selectOption("piper");
  await page
    .getByRole("button", { name: "Check local voice", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Speech engine", exact: true }),
  ).toHaveValue("piper");
  await page
    .getByRole("button", { name: "Speak voice preview", exact: true })
    .click();
  await expect.poll(() => engines.length).toBe(2);
  expect(engines[1]).toBe("piper");
});

test("Stop speech cancels a local answer while audio is still being prepared", async ({
  page,
}) => {
  await page.request.post("/api/sync/session", {
    data: { code: process.env.GW_SYNC_TEST_CODE, role: "controller" },
  });
  await page.route("**/api/sync/voice", (route) =>
    route.fulfill({
      json: { available: true, speech: true, engines: ["kokoro"] },
    }),
  );
  await page.addInitScript(() => {
    const state = {
      started: false,
      aborted: false,
      blobRead: false,
      played: false,
      release: () => {},
    };
    const testWindow = window as unknown as { nexusSpeechTest: typeof state };
    testWindow.nexusSpeechTest = state;
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (
        url.includes("/api/sync/voice?action=speak") &&
        init?.method === "POST"
      ) {
        state.started = true;
        init.signal?.addEventListener(
          "abort",
          () => {
            state.aborted = true;
          },
          { once: true },
        );
        // Deliver a late response even after abort: verify the app's stale-audio
        // guard without leaving a cancelled Playwright network route unresolved.
        return new Promise<Response>((resolve) => {
          state.release = () => {
            const response = new Response("RIFFfixtureWAVE", {
              headers: { "Content-Type": "audio/wav" },
            });
            const originalBlob = response.blob.bind(response);
            response.blob = async () => {
              const blob = await originalBlob();
              state.blobRead = true;
              return blob;
            };
            resolve(response);
          };
        });
      }
      return originalFetch(input, init);
    };
    Object.defineProperty(window, "Audio", {
      configurable: true,
      value: class {
        play() {
          state.played = true;
          return Promise.resolve();
        }
        pause() {}
      },
    });
  });
  await page.goto("/nexus");
  await page.getByText("Nexus voice · Push to talk", { exact: true }).click();
  await expect(page.getByText(/Current voice: Isabella/)).toBeVisible();
  await page
    .getByRole("button", { name: "Speak voice preview", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { nexusSpeechTest: { started: boolean } })
            .nexusSpeechTest.started,
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Stop speech", exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { nexusSpeechTest: { aborted: boolean } })
          .nexusSpeechTest.aborted,
    ),
  ).toBe(true);
  await page.evaluate(() =>
    (
      window as unknown as { nexusSpeechTest: { release: () => void } }
    ).nexusSpeechTest.release(),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { nexusSpeechTest: { blobRead: boolean } })
            .nexusSpeechTest.blobRead,
      ),
    )
    .toBe(true);
  await expect(
    page.getByRole("button", { name: "Speak voice preview", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { nexusSpeechTest: { played: boolean } })
          .nexusSpeechTest.played,
    ),
  ).toBe(false);
});
