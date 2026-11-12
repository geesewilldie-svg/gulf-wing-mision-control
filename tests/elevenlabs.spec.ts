import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  writeElevenConfig,
  verifyStephanie,
  parseElevenInput,
  STEPHANIE_VOICE,
  ELEVEN_MODEL,
} from "../scripts/elevenlabs-lib.mjs";
import {
  generateElevenSpeech,
  elevenSpeechStatus,
  disableElevenSpeech,
  speechInput,
} from "../lib/server/elevenlabs";
import { fixtureCookieHeader } from "./helpers/access";
const base = {
  version: 1,
  enabled: true,
  secretType: "windows-dpapi",
  protectedKey: "01000000" + "ab".repeat(100),
  voiceId: STEPHANIE_VOICE,
  model: ELEVEN_MODEL,
  dailyCharacters: 100,
  cloudSpeechAccepted: true,
};
const key = "synthetic_eleven_key_1234567890";
const input = (text = "Hello from Nexus.") => ({
  text,
  cloudSpeechConsent: true,
});
const unlocked = async () => key;
const signal = () => new AbortController().signal;
const audio = () =>
  new Response(new Uint8Array([73, 68, 51, 1, 2, 3]), {
    headers: { "Content-Type": "audio/mpeg" },
  });
test.describe("ElevenLabs speech boundary", () => {
  let root: string, previous: string | undefined;
  test.beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "nexus-eleven-"));
    previous = process.env.GW_SYNC_DATA_DIR;
    process.env.GW_SYNC_DATA_DIR = root;
    await writeElevenConfig(base, root);
  });
  test.afterEach(async () => {
    if (previous === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = previous;
    await fs.rm(root, { recursive: true, force: true });
  });
  test("exact selected voice and fixed API receive only explicitly permitted speech text", async () => {
    let count = 0;
    const result = await generateElevenSpeech(input(), signal(), {
      unlock: unlocked,
      transport: (async (url, init) => {
        count++;
        expect(String(url)).toBe(
          `https://api.elevenlabs.io/v1/text-to-speech/${STEPHANIE_VOICE}?output_format=mp3_44100_128`,
        );
        expect(init?.redirect).toBe("error");
        expect(init?.headers).toMatchObject({ "xi-api-key": key });
        expect(JSON.parse(init?.body as string)).toEqual({
          text: "Hello from Nexus.",
          model_id: ELEVEN_MODEL,
        });
        return audio();
      }) as typeof fetch,
    });
    expect(result.length).toBe(6);
    expect(count).toBe(1);
    const status = await elevenSpeechStatus();
    expect(status.usedCharacters).toBe(17);
    expect(JSON.stringify(status)).not.toContain(base.protectedKey);
    expect(JSON.stringify(status)).not.toContain(key);
  });
  test("missing consent, extra private fields and excessive text never dispatch", async () => {
    for (const value of [
      { text: "Hello" },
      { ...input(), history: [] },
      input("a".repeat(3001)),
      { ...input(), engine: "custom" },
    ])
      expect(() => speechInput(value)).toThrow();
    const ledger = await fs.readdir(root);
    expect(ledger).toEqual(["elevenlabs.json"]);
  });
  test("daily reservation persists and failures retain allowance without retries", async () => {
    let calls = 0;
    const transport = (async () => {
      calls++;
      return new Response("SECRET " + key, { status: 429 });
    }) as typeof fetch;
    await expect(
      generateElevenSpeech(input("x".repeat(60)), signal(), {
        unlock: unlocked,
        transport,
      }),
    ).rejects.toThrow("quota or rate limit");
    await expect(
      generateElevenSpeech(input("y".repeat(60)), signal(), {
        unlock: unlocked,
        transport,
      }),
    ).rejects.toThrow("Daily ElevenLabs");
    expect(calls).toBe(1);
    expect((await elevenSpeechStatus()).usedCharacters).toBe(60);
    expect(
      await fs.readFile(path.join(root, "elevenlabs-allowance.json"), "utf8"),
    ).not.toContain(key);
  });
  test("provider authentication/error text never reaches the client", async () => {
    for (const code of [401, 403, 500]) {
      try {
        await generateElevenSpeech(input(), signal(), {
          unlock: unlocked,
          transport: (async () =>
            new Response(key + " private error", {
              status: code,
            })) as typeof fetch,
        });
        throw Error("Expected rejection");
      } catch (error) {
        expect((error as Error).message).not.toContain(key);
        expect((error as Error).message).not.toContain("private error");
      }
    }
  });
  test("corrupt accounting and an existing lock fail closed without generation", async () => {
    let calls = 0;
    const transport = (async () => {
      calls++;
      return audio();
    }) as typeof fetch;
    await fs.writeFile(path.join(root, "elevenlabs-allowance.json"), "broken");
    await expect(
      generateElevenSpeech(input(), signal(), { unlock: unlocked, transport }),
    ).rejects.toThrow("accounting");
    await fs.rm(path.join(root, "elevenlabs-allowance.json"));
    await fs.writeFile(path.join(root, "elevenlabs-allowance.lock"), "");
    await expect(
      generateElevenSpeech(input(), signal(), { unlock: unlocked, transport }),
    ).rejects.toThrow("locked");
    expect(calls).toBe(0);
  });
  test("concurrent calls do not start duplicate billable generation", async () => {
    let release!: () => void;
    let started!: () => void;
    const ready = new Promise<void>((r) => (started = r)),
      wait = new Promise<void>((r) => (release = r));
    const pending = generateElevenSpeech(input(), signal(), {
      unlock: unlocked,
      transport: (async () => {
        started();
        await wait;
        return audio();
      }) as typeof fetch,
    });
    await ready;
    await expect(
      generateElevenSpeech(input(), signal(), { unlock: unlocked }),
    ).rejects.toThrow("busy");
    release();
    await pending;
  });
  test("disable aborts in-flight speech and prevents future dispatch", async () => {
    let started!: () => void;
    const ready = new Promise<void>((r) => (started = r));
    const pending = generateElevenSpeech(input(), signal(), {
      unlock: unlocked,
      transport: (async (_url, init) => {
        started();
        return new Promise<Response>((_resolve, reject) =>
          init!.signal!.addEventListener(
            "abort",
            () => reject(Error("aborted")),
            { once: true },
          ),
        );
      }) as typeof fetch,
    });
    const failure = expect(pending).rejects.toThrow("stopped or timed out");
    await ready;
    await disableElevenSpeech();
    await failure;
    await expect(
      generateElevenSpeech(input(), signal(), { unlock: unlocked }),
    ).rejects.toThrow("not enabled");
    expect((await elevenSpeechStatus()).usedCharacters).toBe(17);
  });
  test("pre-aborted requests, changed configuration and invalid audio are rejected", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      generateElevenSpeech(input(), controller.signal, { unlock: unlocked }),
    ).rejects.toThrow("stopped");
    await expect(
      generateElevenSpeech(input(), signal(), {
        unlock: async () => {
          await writeElevenConfig({ ...base, enabled: false }, root);
          return key;
        },
      }),
    ).rejects.toThrow("changed");
    await writeElevenConfig(base, root);
    await expect(
      generateElevenSpeech(input(), signal(), {
        unlock: unlocked,
        transport: (async () =>
          new Response("bad", {
            headers: { "Content-Type": "text/html" },
          })) as typeof fetch,
      }),
    ).rejects.toThrow("unexpected audio");
  });
  test("setup verifies voice metadata without generating speech or revealing errors", async () => {
    let calls = 0;
    await verifyStephanie(key, (async (url, init) => {
      calls++;
      expect(String(url)).toBe(
        `https://api.elevenlabs.io/v1/voices/${STEPHANIE_VOICE}`,
      );
      expect(init?.method).toBeUndefined();
      return Response.json({ voice_id: STEPHANIE_VOICE });
    }) as typeof fetch);
    expect(calls).toBe(1);
    await expect(
      verifyStephanie(
        key,
        (async () => new Response(key, { status: 403 })) as typeof fetch,
      ),
    ).rejects.toThrow("HTTP_403");
    await expect(
      verifyStephanie(key, (async () =>
        Response.json({ voice_id: "another-voice" })) as typeof fetch),
    ).rejects.toThrow("not confirmed");
    expect(parseElevenInput(Buffer.from('\uFEFF{"key":"synthetic"}'))).toEqual({
      key: "synthetic",
    });
    const before = await fs.readFile(
      path.join(root, "elevenlabs.json"),
      "utf8",
    );
    await expect(
      writeElevenConfig({ ...base, voiceId: "different" }, root),
    ).rejects.toThrow();
    expect(await fs.readFile(path.join(root, "elevenlabs.json"), "utf8")).toBe(
      before,
    );
  });
});

test("cloud speech routes require controller access, same origin, consent and bounded input", async ({
  request,
}) => {
  for (const method of ["get", "post", "delete"] as const) {
    expect((await request[method]("/api/sync/elevenlabs")).status()).toBe(401);
    expect(
      (
        await request[method]("/api/sync/elevenlabs", {
          headers: { Cookie: fixtureCookieHeader("display") },
        })
      ).status(),
    ).toBe(403);
  }
  const headers = { Cookie: fixtureCookieHeader("controller") };
  expect(
    (await request.get("/api/sync/elevenlabs", { headers })).status(),
  ).toBe(200);
  expect(
    (
      await request.post("/api/sync/elevenlabs", {
        headers,
        data: { text: "Hello" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/sync/elevenlabs", {
        headers: { ...headers, Origin: "https://outside.invalid" },
        data: input(),
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/sync/elevenlabs", {
        headers,
        data: { ...input(), history: [] },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/sync/elevenlabs", {
        headers,
        data: input("x".repeat(17000)),
      })
    ).status(),
  ).toBe(413);
  expect(
    (
      await request.delete("/api/sync/elevenlabs", {
        headers: { ...headers, Origin: "https://outside.invalid" },
      })
    ).status(),
  ).toBe(403);
});
