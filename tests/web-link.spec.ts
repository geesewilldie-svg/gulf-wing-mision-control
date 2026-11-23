import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { reviewedWebLink, webLinkIntent } from "../lib/web-link";
import {
  webLinkProposal,
  openReviewedWebLink,
  webLinkLaunchPlan,
} from "../lib/server/web-link";
import { recentLaptopOperations } from "../lib/server/laptop-operations";
import { withStore } from "../lib/server/foundation/store";
import { configureLinkOpening } from "../scripts/link-opening-lib.mjs";
import { fixtureRole } from "./helpers/access";
import { openAssistant } from "./helpers/assistant";
async function isolated(run: (dir: string) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(tmpdir(), "nexus-link-")),
    prior = process.env.GW_SYNC_DATA_DIR;
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
  process.env.GW_SYNC_DATA_DIR = dir;
  try {
    await run(dir);
  } finally {
    Object.defineProperty(process, "platform", platform);
    if (prior === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = prior;
    await fs.rm(dir, { recursive: true, force: true });
  }
}
test("link review accepts only complete HTTPS URLs and literal Windows arguments", () => {
  expect(
    webLinkIntent("Nexus, please open https://example.com on my laptop"),
  ).toBe("https://example.com");
  expect(webLinkIntent("open on laptop https://example.com")).toBe(
    "https://example.com",
  );
  expect(
    webLinkIntent("Explain how to open https://example.com on laptop"),
  ).toBeNull();
  for (const value of [
    "file:///C:/x",
    "javascript:alert(1)",
    "http://example.com",
    "https://user:pass@example.com",
    "https://example.com\ncalc",
    "--help",
    "https://example.com and run calc",
  ])
    expect(() => reviewedWebLink(value)).toThrow();
  const plan = webLinkLaunchPlan(
    "https://EXAMPLE.com/a?x=1&y=2",
    "C:\\Windows",
  );
  expect(plan.command).toBe("C:\\Windows\\explorer.exe");
  expect(plan.args).toEqual(["https://example.com/a?x=1&y=2"]);
  expect(() => webLinkLaunchPlan("https://example.com", "relative")).toThrow();
});
test("local setup is explicit, reversible and preserves malformed configuration", async () =>
  isolated(async (dir) => {
    await expect(configureLinkOpening(dir, true, "linux")).rejects.toThrow(
      "Windows",
    );
    await configureLinkOpening(dir, true, "win32");
    expect(
      JSON.parse(await fs.readFile(path.join(dir, "link-opening.json"), "utf8"))
        .enabled,
    ).toBe(true);
    await configureLinkOpening(dir, false, "win32");
    expect(
      JSON.parse(await fs.readFile(path.join(dir, "link-opening.json"), "utf8"))
        .enabled,
    ).toBe(false);
    await fs.writeFile(path.join(dir, "link-opening.json"), "{");
    await expect(configureLinkOpening(dir, true, "win32")).rejects.toThrow();
    expect(await fs.readFile(path.join(dir, "link-opening.json"), "utf8")).toBe(
      "{",
    );
  }));
test("preview does not dispatch; confirmed requests bind URL and deduplicate saved handoffs", async () =>
  isolated(async (dir) => {
    Object.defineProperty(process, "platform", {
      value: "win32",
      configurable: true,
    });
    const key = randomUUID(),
      url = "https://example.com/private?token=fixture-secret";
    const proposal = await webLinkProposal(url, key);
    expect(proposal.linkPreview.enabled).toBe(false);
    expect(recentLaptopOperations()).toEqual([]);
    let calls = 0;
    const dispatch = async (target: string) => {
      expect(target).toBe(url);
      calls++;
    };
    const body = { url, requestId: key, confirmed: true };
    await expect(
      openReviewedWebLink({ ...body, confirmed: false }, undefined, dispatch),
    ).rejects.toThrow("confirmation");
    await expect(
      openReviewedWebLink(body, undefined, dispatch),
    ).rejects.toThrow("Enable");
    await configureLinkOpening(dir, true, "win32");
    const result = await openReviewedWebLink(body, undefined, dispatch);
    expect(result.outcome).toBe("complete");
    expect(result.message).toContain("not been verified");
    expect((await openReviewedWebLink(body, undefined, dispatch)).id).toBe(
      result.id,
    );
    expect(calls).toBe(1);
    await expect(
      openReviewedWebLink(
        { ...body, url: "https://different.example" },
        undefined,
        dispatch,
      ),
    ).rejects.toThrow("different operation arguments");
    const evidence = withStore((db) =>
      db.prepare("SELECT detail FROM events").all(),
    );
    expect(JSON.stringify(evidence)).not.toContain("fixture-secret");
    expect(JSON.stringify(recentLaptopOperations())).not.toContain(
      "fixture-secret",
    );
  }));
test("revocation and transport failure never claim a verified page", async () =>
  isolated(async (dir) => {
    Object.defineProperty(process, "platform", {
      value: "win32",
      configurable: true,
    });
    await configureLinkOpening(dir, true, "win32");
    const read = fs.readFile;
    let reads = 0,
      calls = 0;
    fs.readFile = (async (...args: any[]) => {
      const result = await (read as any)(...args);
      if (String(args[0]).endsWith("link-opening.json") && ++reads === 1)
        await fs.writeFile(
          path.join(dir, "link-opening.json"),
          JSON.stringify({ version: 1, enabled: false }),
        );
      return result;
    }) as typeof fs.readFile;
    try {
      await expect(
        openReviewedWebLink(
          {
            url: "https://example.com",
            requestId: randomUUID(),
            confirmed: true,
          },
          undefined,
          async () => {
            calls++;
          },
        ),
      ).rejects.toThrow("disabled before dispatch");
      expect(calls).toBe(0);
      expect(recentLaptopOperations()[0].outcome).toBe("not-started");
    } finally {
      fs.readFile = read;
    }
    await configureLinkOpening(dir, true, "win32");
    await expect(
      openReviewedWebLink(
        {
          url: "https://example.com",
          requestId: randomUUID(),
          confirmed: true,
        },
        undefined,
        async () => {
          throw Error("Synthetic handoff failure");
        },
      ),
    ).rejects.toThrow();
    expect(recentLaptopOperations()[0].outcome).toBe("unknown");
  }));
test("link API and conversation preserve identity, origin, confirmation and local routing", async ({
  context,
}) => {
  const body = {
    url: "https://example.com",
    requestId: randomUUID(),
    confirmed: true,
  };
  expect(
    (await context.request.post("/api/sync/web-link", { data: body })).status(),
  ).toBe(401);
  await fixtureRole(context, "display");
  expect(
    (await context.request.post("/api/sync/web-link", { data: body })).status(),
  ).toBe(403);
  await fixtureRole(context, "controller");
  expect(
    (
      await context.request.post("/api/sync/web-link", {
        data: body,
        headers: { Origin: "https://untrusted.example" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await context.request.post("/api/sync/web-link", {
        data: { ...body, confirmed: false },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await context.request.post("/api/sync/web-link", {
        data: { ...body, command: "whoami" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (await context.request.post("/api/sync/web-link", { data: body })).status(),
  ).toBe(409);
  expect(
    (
      await context.request.post("/api/sync/nexus", {
        data: {
          query: "Open on laptop https://example.com",
          mode: "gemini",
          allowExternal: true,
        },
      })
    ).status(),
  ).toBe(403);
  const preview = await context.request.post("/api/sync/nexus", {
    data: { query: "Open on laptop https://example.com", mode: "auto" },
  });
  expect(preview.ok()).toBe(true);
  expect((await preview.json()).linkPreview.url).toBe("https://example.com/");
});
test("review card does not open a link until its explicit button is chosen", async ({
  page,
  context,
}) => {
  await fixtureRole(context, "controller");
  let opens = 0;
  await page.route("**/api/sync/nexus", (route) => {
    if (route.request().method() !== "POST") return route.continue();
    return route.fulfill({
      json: {
        engine: "Nexus link review",
        answer: "Review this link",
        sources: [],
        linkPreview: {
          url: "https://example.com/",
          host: "example.com",
          requestId: "fixture-link-request",
          supported: true,
          enabled: true,
        },
      },
    });
  });
  await page.route("**/api/sync/web-link", (route) => {
    opens++;
    return route.fulfill({
      json: {
        id: "a".repeat(24),
        outcome: "complete",
        message: "Open request handed to Windows; page not verified.",
      },
    });
  });
  await page.goto("/nexus");
  await openAssistant(page);
  await page
    .locator("form")
    .getByLabel("Ask Nexus", { exact: true })
    .fill("Open on laptop https://example.com");
  await page
    .locator("form")
    .getByRole("button", { name: "Ask Nexus", exact: true })
    .click();
  const review = page.getByRole("region", {
    name: "Review laptop link",
    exact: true,
  });
  await expect(review.getByText("example.com", { exact: true })).toBeVisible();
  expect(opens).toBe(0);
  await fs.mkdir("artifacts/web-links", { recursive: true });
  expect(
    await review.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await review.screenshot({
    path: `artifacts/web-links/review-${page.viewportSize()!.width}.png`,
  });
  await review
    .getByRole("button", { name: "Open on laptop", exact: true })
    .click();
  await expect(review.getByRole("status")).toContainText("page not verified");
  await expect(
    review.getByRole("button", { name: "Open on laptop", exact: true }),
  ).toBeDisabled();
  expect(opens).toBe(1);
});
