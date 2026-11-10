import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  availablePublicModels,
  safeGeminiSetupDiagnostic,
  parseGeminiSetupInput,
} from "./gemini-public-lib.mjs";
const key = "synthetic_key_012345678901234567890";
const canary = "PRIVATE_KEY_AND_PROVIDER_BODY_CANARY";
async function diagnostic(transport) {
  try {
    await availablePublicModels(key, transport);
    assert.fail("expected a diagnosis");
  } catch (error) {
    const d = safeGeminiSetupDiagnostic(error);
    assert.ok(!JSON.stringify(d).includes(key));
    assert.ok(!JSON.stringify(d).includes(canary));
    return d;
  }
}
test("permission and API-disabled diagnoses read allowlisted reasons but never provider messages, metadata or key echoes", async () => {
  for (const [reason, code] of [
    ["SERVICE_DISABLED", "API_DISABLED"],
    ["API_KEY_INVALID", "KEY_REJECTED"],
    ["API_KEY_SERVICE_BLOCKED", "KEY_RESTRICTION"],
    ["API_KEY_IP_ADDRESS_BLOCKED", "KEY_RESTRICTION"],
    ["API_KEY_HTTP_REFERRER_BLOCKED", "KEY_RESTRICTION"],
    ["BILLING_DISABLED", "BILLING_REQUIRED_BY_PROVIDER"],
    ["QUOTA_EXCEEDED", "FREE_QUOTA_UNAVAILABLE"],
  ]) {
    const d = await diagnostic(async () =>
      Response.json(
        {
          error: {
            message: canary + key,
            details: [{ reason, metadata: { key, private: canary } }],
          },
        },
        { status: 403 },
      ),
    );
    assert.equal(d.code, code);
    assert.equal(d.httpStatus, 403);
  }
});
test("HTTP status alone remains actionable and never forwards arbitrary or oversized error bodies", async () => {
  for (const [status, code] of [
    [401, "KEY_REJECTED"],
    [403, "GOOGLE_ACCESS_DENIED"],
    [429, "FREE_QUOTA_UNAVAILABLE"],
    [500, "GOOGLE_HTTP_ERROR"],
  ])
    assert.equal(
      (await diagnostic(async () => new Response(canary + key, { status })))
        .code,
      code,
    );
  assert.equal(
    (
      await diagnostic(
        async () => new Response(canary.repeat(10000), { status: 403 }),
      )
    ).code,
    "GOOGLE_ACCESS_DENIED",
  );
  assert.equal(
    (
      await diagnostic(async () =>
        Response.json(
          { error: { details: [{ reason: canary + key }] } },
          { status: 403 },
        ),
      )
    ).code,
    "GOOGLE_ACCESS_DENIED",
  );
});
test("network, DNS, certificate and timeout failures are classified without copying raw exceptions", async () => {
  for (const [cause, code] of [
    ["ENOTFOUND", "DNS_ERROR"],
    ["SELF_SIGNED_CERT_IN_CHAIN", "TLS_ERROR"],
    ["UND_ERR_CONNECT_TIMEOUT", "NETWORK_TIMEOUT"],
    ["ECONNREFUSED", "NETWORK_ERROR"],
  ]) {
    const d = await diagnostic(async () => {
      throw Object.assign(new Error(canary + key), {
        cause: { code: cause, message: key },
      });
    });
    assert.equal(d.code, code);
  }
  assert.equal(
    (
      await diagnostic(async () => {
        throw Object.assign(new Error(canary), { name: "TimeoutError" });
      })
    ).code,
    "NETWORK_TIMEOUT",
  );
});
test("key validation happens before networking and unsupported models return only a count", async () => {
  let calls = 0;
  try {
    await availablePublicModels("quoted " + key, async () => {
      calls++;
    });
    assert.fail();
  } catch (error) {
    assert.equal(safeGeminiSetupDiagnostic(error).code, "KEY_FORMAT");
  }
  assert.equal(calls, 0);
  const d = await diagnostic(async () =>
    Response.json({
      models: [
        {
          name: "models/" + canary + key,
          supportedGenerationMethods: ["generateContent"],
        },
      ],
    }),
  );
  assert.equal(d.code, "NO_SUPPORTED_MODEL");
  assert.equal(d.availableModels, 1);
  assert.ok(!JSON.stringify(d).includes("models/"));
});
test("valid metadata still returns the supported preference list; malformed responses have fixed diagnoses", async () => {
  assert.deepEqual(
    await availablePublicModels(key, async () =>
      Response.json({
        models: [
          {
            name: "models/gemini-2.5-flash",
            supportedGenerationMethods: ["generateContent"],
          },
          {
            name: "models/gemini-3.5-flash-lite",
            supportedGenerationMethods: ["generateContent"],
          },
        ],
      }),
    ),
    ["gemini-3.5-flash-lite", "gemini-2.5-flash"],
  );
  assert.equal(
    (await diagnostic(async () => new Response(canary))).code,
    "MODEL_LIST_INVALID",
  );
  assert.equal(
    (await diagnostic(async () => new Response("x".repeat(500001)))).code,
    "MODEL_LIST_TOO_LARGE",
  );
});
test("Windows UTF-8 BOM and UTF-16LE input decode without printing content", () => {
  const raw = JSON.stringify({ key });
  assert.equal(
    parseGeminiSetupInput(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(raw)]),
    ).key,
    key,
  );
  assert.equal(
    parseGeminiSetupInput(
      Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(raw, "utf16le")]),
    ).key,
    key,
  );
  for (const value of [
    Buffer.from(canary),
    Buffer.from("[]"),
    Buffer.alloc(30001),
  ])
    assert.throws(() => parseGeminiSetupInput(value));
  assert.equal(
    safeGeminiSetupDiagnostic(new Error(canary + key)).code,
    "SETUP_FAILED",
  );
});
async function cli(action, input, root) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["scripts/setup-nexus-gemini.mjs", action],
      {
        env: { ...process.env, GW_SYNC_DATA_DIR: root },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let out = "",
      err = "";
    child.stdout.on("data", (b) => (out += b));
    child.stderr.on("data", (b) => (err += b));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, out, err }));
    child.stdin.end(input);
  });
}
test("actual CLI errors are structured on stdout for PowerShell, omit secrets and preserve prior configuration", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nexus-gemini-setup-"));
  try {
    const target = path.join(root, "gemini-public.json");
    await writeFile(target, "existing-encrypted-config");
    for (const [action, input, code] of [
      ["--models", JSON.stringify({ key: "quoted " + canary }), "KEY_FORMAT"],
      [
        "--models",
        "\uFEFF" + JSON.stringify({ key: "bad " + key }),
        "KEY_FORMAT",
      ],
      ["--models", canary, "SETUP_INPUT_INVALID"],
      ["--save", JSON.stringify({ key: canary }), "SETUP_FAILED"],
    ]) {
      const r = await cli(action, input, root);
      assert.equal(r.code, 1);
      assert.equal(r.err, "");
      assert.equal(JSON.parse(r.out).diagnostic.code, code);
      assert.ok(!(r.out + r.err).includes(canary));
      assert.ok(!(r.out + r.err).includes(key));
      assert.equal(await readFile(target, "utf8"), "existing-encrypted-config");
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI success envelope survives Windows BOM input and saves only validated encrypted configuration", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "nexus-gemini-cli-success-"),
  );
  try {
    const preload = path.join(root, "provider-fixture.mjs");
    await writeFile(
      preload,
      `globalThis.fetch = async () => Response.json({models:[{name:"models/gemini-3.5-flash-lite",supportedGenerationMethods:["generateContent"]}]});`,
    );
    const result = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          "--import",
          pathToFileURL(preload).href,
          "scripts/setup-nexus-gemini.mjs",
          "--models",
        ],
        {
          env: { ...process.env, GW_SYNC_DATA_DIR: root },
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      let out = "",
        err = "";
      child.stdout.on("data", (b) => (out += b));
      child.stderr.on("data", (b) => (err += b));
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, out, err }));
      child.stdin.end(
        Buffer.concat([
          Buffer.from([0xef, 0xbb, 0xbf]),
          Buffer.from(JSON.stringify({ key })),
        ]),
      );
    });
    assert.equal(result.code, 0);
    assert.equal(result.err, "");
    assert.deepEqual(JSON.parse(result.out), {
      ok: true,
      models: ["gemini-3.5-flash-lite"],
    });
    assert.ok(!result.out.includes(key));
    await assert.rejects(readFile(path.join(root, "gemini-public.json")), {
      code: "ENOENT",
    });
    const config = {
      version: 1,
      policy: "public-only",
      enabled: true,
      secretType: "windows-dpapi",
      protectedKey: "01000000" + "ab".repeat(100),
      model: "gemini-3.5-flash-lite",
      dailyLimit: 10,
    };
    const saved = await cli("--save", JSON.stringify(config), root);
    assert.equal(saved.code, 0);
    assert.equal(JSON.parse(saved.out).ok, true);
    assert.ok(!saved.out.includes(config.protectedKey));
    assert.deepEqual(
      JSON.parse(await readFile(path.join(root, "gemini-public.json"), "utf8")),
      config,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("opaque token punctuation and longer keys reach provider validation without being printed", async () => {
  const { isGeminiApiKey, MAX_GEMINI_KEY_CHARS } = await import(
    "./gemini-public-lib.mjs"
  );
  for (const token of [
    "AQ.synthetic.opaque_key-0123456789",
    "synthetic+token/0123456789012345==",
    "a".repeat(300),
    "b".repeat(MAX_GEMINI_KEY_CHARS),
  ]) {
    assert.equal(isGeminiApiKey(token), true);
    let calls = 0;
    const models = await availablePublicModels(token, async (_url, init) => {
      calls++;
      assert.equal(init.headers["x-goog-api-key"], token);
      return Response.json({
        models: [
          {
            name: "models/gemini-3.5-flash-lite",
            supportedGenerationMethods: ["generateContent"],
          },
        ],
      });
    });
    assert.equal(calls, 1);
    assert.deepEqual(models, ["gemini-3.5-flash-lite"]);
  }
});
test("format diagnoses reveal only a fixed category, never key characters, prefix or length", async () => {
  const { isGeminiApiKey, MAX_GEMINI_KEY_CHARS } = await import(
    "./gemini-public-lib.mjs"
  );
  const inputs = [
    ["", "EMPTY"],
    ["x".repeat(MAX_GEMINI_KEY_CHARS + 1), "TOO_LONG"],
    ["***masked***", "MASKED_VALUE"],
    ["AIza...masked-value", "MASKED_VALUE"],
    ["https://example.test/" + canary, "URL_OR_LINK"],
    ["bad " + key, "WHITESPACE_OR_CONTROL"],
    [key + "\r\nx-secret: " + canary, "WHITESPACE_OR_CONTROL"],
    ['"' + key + '"', "QUOTED_OR_CODE"],
    ["short", "TOO_SHORT"],
    ["synthetic:" + key, "UNSUPPORTED_CHARACTERS"],
  ];
  for (const [token, category] of inputs) {
    assert.equal(isGeminiApiKey(token), false);
    let calls = 0;
    try {
      await availablePublicModels(token, async () => {
        calls++;
      });
      assert.fail("should reject unsafe shape");
    } catch (error) {
      const result = safeGeminiSetupDiagnostic(error);
      assert.equal(result.code, "KEY_FORMAT");
      assert.equal(result.inputCategory, category);
      assert.ok(!JSON.stringify(result).includes(key));
      assert.ok(!JSON.stringify(result).includes(canary));
      assert.equal(result.keyLength, undefined);
      assert.equal(result.prefix, undefined);
    }
    assert.equal(calls, 0);
  }
  const redacted = safeGeminiSetupDiagnostic({
    setupCode: "KEY_FORMAT",
    keyIssue: canary,
  });
  assert.equal(redacted.inputCategory, undefined);
});
