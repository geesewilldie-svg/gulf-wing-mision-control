const http = require("http"),
  fs = require("fs"),
  os = require("os"),
  path = require("path"),
  crypto = require("crypto"),
  { spawn } = require("child_process");
const { chromium } = require("@playwright/test");
fs.mkdirSync(path.join(process.cwd(), "test-results", "nexus-runtime"), {
  recursive: true,
});
const root = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-protocol-"));
const code = crypto.randomBytes(16).toString("hex");
fs.writeFileSync(
  path.join(root, "sync-config.json"),
  JSON.stringify({
    version: 1,
    pairingHash: crypto.createHash("sha256").update(code).digest("hex"),
    signingSecret: crypto.randomBytes(32).toString("hex"),
  }),
);
let child,
  browser,
  model,
  voice,
  modelCalls = 0;
const listen = (s) =>
  new Promise((resolve, reject) => {
    s.once("error", reject);
    s.listen(s === model ? 11434 : 8766, "127.0.0.1", resolve);
  });
(async () => {
  model = http.createServer((req, res) => {
    if (req.url === "/api/tags") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ models: [{ name: "test-model" }] }));
      return;
    }
    let raw = "";
    req.on("data", (b) => (raw += b));
    req.on("end", () => {
      const body = JSON.parse(raw);
      if (
        body.model !== "test-model" ||
        !body.messages[0].content.includes("Fixture services")
      ) {
        res.writeHead(400);
        res.end();
        return;
      }
      modelCalls++;
      setTimeout(() => {
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            message: { content: "Protocol fixture answer [1]." },
          }),
        );
      }, 200);
    });
  });
  voice = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({ available: true, speech: true, transcription: true }),
      );
    } else if (req.url === "/speak") {
      req.resume();
      req.on("end", () => {
        res.setHeader("Content-Type", "audio/wav");
        res.end(Buffer.from("RIFFfixtureWAVE"));
      });
    } else {
      req.resume();
      req.on("end", () => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ text: "Fixture transcript" }));
      });
    }
  });
  await listen(model);
  await listen(voice);
  child = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--port", "3033"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        GW_SYNC_DATA_DIR: root,
        GW_NEXUS_MODEL: "test-model",
      },
      stdio: "ignore",
    },
  );
  const base = "http://127.0.0.1:3033";
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(base);
      if (r.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const paired = await fetch(base + "/api/sync/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, role: "controller" }),
  });
  const cookie = paired.headers.get("set-cookie").split(";")[0];
  const headers = { "Content-Type": "application/json", cookie };
  const imported = await fetch(base + "/api/sync/nexus", {
    method: "PUT",
    headers,
    body: JSON.stringify([
      {
        id: "fixture",
        source: "Sample operating guide",
        location: "Example page",
        text: "Fixture services include cleaning. Synthetic test content, not a business record.",
      },
    ]),
  });
  if (!imported.ok) throw Error("import failed");
  const ask = () =>
    fetch(base + "/api/sync/nexus", {
      method: "POST",
      headers,
      body: JSON.stringify({ query: "cleaning", mode: "auto" }),
    });
  const responses = await Promise.all([ask(), ask()]);
  if (
    responses
      .map((r) => r.status)
      .sort()
      .join(",") !== "200,429"
  )
    throw Error("generation concurrency guard");
  const ok = responses.find((r) => r.ok);
  const answer = await ok.json();
  if (
    answer.engine !== "Local model: test-model" ||
    !answer.answer.includes("[1]")
  )
    throw Error("local model protocol");
  const audio = await fetch(base + "/api/sync/voice?action=speak", {
    method: "POST",
    headers,
    body: JSON.stringify({ text: "Test" }),
  });
  if (audio.headers.get("content-type") !== "audio/wav")
    throw Error("audio response");
  const transcript = await fetch(base + "/api/sync/voice?action=transcribe", {
    method: "POST",
    headers: { cookie, "Content-Type": "audio/webm" },
    body: Buffer.from("fixture"),
  });
  if ((await transcript.json()).text !== "Fixture transcript")
    throw Error("transcription response");
  browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
      (fs.existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    headless: true,
  });
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      reducedMotion: "reduce",
    });
    await context.addCookies([
      {
        name: "gw_sync_session",
        value: cookie.split("=")[1],
        domain: "127.0.0.1",
        path: "/api/sync",
      },
    ]);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base + "/nexus");
    await page
      .locator("form")
      .getByLabel("Ask Nexus", { exact: true })
      .fill("cleaning");
    await page
      .locator("form")
      .getByRole("button", { name: "Ask Nexus", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Local model: test-model", exact: true })
      .waitFor();
    await page.screenshot({
      path: `${process.cwd()}/test-results/nexus-runtime/nexus-${name}.png`,
      fullPage: true,
    });
    if (
      (await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )) ||
      errors.length
    )
      throw Error("browser verification");
    await context.close();
  }
  console.log(
    "Local model adapter, source context, concurrency guard, voice proxy speech/transcription, and desktop/mobile browser captures passed using synthetic protocol fixtures. No real model/audio inference claimed.",
  );
})()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
    child?.kill();
    await Promise.all(
      [model, voice]
        .filter((s) => s?.listening)
        .map((s) => new Promise((r) => s.close(r))),
    );
    fs.rmSync(root, { recursive: true, force: true });
  });
