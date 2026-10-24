const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {}),
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
  });
  const errors = [],
    remote = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (/^https?:/.test(r.url())) remote.push(r.url());
  });
  await page.setContent(
    require("node:fs").readFileSync(
      require("node:path").join(
        __dirname,
        "../public/nexus-wallpaper/index.html",
      ),
      "utf8",
    ),
  );
  await page.waitForTimeout(600);
  const one = await page.locator("canvas").evaluate((c) => c.toDataURL());
  await page.waitForTimeout(250);
  assert.notEqual(
    await page.locator("canvas").evaluate((c) => c.toDataURL()),
    one,
    "globe animates",
  );
  await page.getByRole("button", { name: "Pause motion", exact: true }).click();
  const paused = await page.locator("canvas").evaluate((c) => c.toDataURL());
  await page.waitForTimeout(200);
  assert.equal(
    await page.locator("canvas").evaluate((c) => c.toDataURL()),
    paused,
    "pause stops animation",
  );
  await page.getByRole("button", { name: "Hide panels" }).click();
  assert.equal(await page.locator(".side").first().isVisible(), false);
  await page.getByRole("button", { name: "Show panels" }).click();
  if (process.env.GW_WALLPAPER_PREVIEW === "1") {
    await page
      .locator(".controls")
      .evaluate((e) => (e.style.visibility = "hidden"));
    await page
      .locator("#motion-state")
      .evaluate((e) => (e.textContent = "AMBIENT"));
    await page.screenshot({
      path: require("node:path").join(
        __dirname,
        "../public/nexus-wallpaper/preview.jpg",
      ),
      type: "jpeg",
      quality: 90,
    });
  }
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.waitForTimeout(100);
  assert.ok(
    await page.locator("canvas").evaluate((c) => c.width <= 4800),
    "DPI capped",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForFunction(() => document.getElementById("motion-state").textContent === "PAUSED");
  assert.deepEqual(errors, []);
  assert.deepEqual(remote, []);
  await browser.close();
  console.log(
    "PASS: offline animation, pause, HUD toggle, 1080p/4K/mobile, reduced motion, zero page errors and zero network requests.",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
