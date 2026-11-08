import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import {
  beginGoogle,
  finishGoogle,
  googleStatus,
  googleAccounts,
  disconnectGoogle,
  GOOGLE_SCOPE,
  DRIVE_SCOPE,
  googleAccessToken,
} from "../lib/server/google-accounts";
import { googleEvents } from "../lib/server/google-calendar";
import { defaultBriefSettings } from "../lib/daily-brief";
import {
  browseDrive,
  selectDriveFile,
  refreshDrive,
  driveDocuments,
  driveStatus,
  removeDriveFile,
  searchDriveIndex,
} from "../lib/server/google-drive";
const doc = "doc1234567890",
  sheet = "sheet1234567890",
  pdf = "pdf1234567890";
async function connect(
  email: string,
  features: "calendar" | "drive" | "both" = "both",
  id?: string,
  expiresIn = 3600,
) {
  const start = await beginGoogle(features, id),
    scope = new URL(start.url).searchParams.get("scope")!;
  await finishGoogle(start.state, start.state, "synthetic-code", (async (
    input: any,
  ) =>
    String(input).includes("/token")
      ? Response.json({
          access_token: "access-" + email,
          refresh_token: "refresh-" + email,
          expires_in: expiresIn,
          scope,
        })
      : Response.json({ email, email_verified: true })) as typeof fetch);
  return (await googleAccounts()).find((a) => a.email === email)!;
}
function driveTransport(
  options: { fail?: string; large?: boolean; changed?: boolean } = {},
) {
  const calls: string[] = [];
  let metadataCalls = 0;
  const transport = (async (input: any, init: any) => {
    const u = new URL(String(input));
    calls.push(u.toString());
    expect(u.origin).toBe("https://www.googleapis.com");
    expect(init.redirect).toBe("error");
    expect(init.headers.Authorization).toContain("Bearer access-");
    const types: Record<string, string> = {
      [doc]: "application/vnd.google-apps.document",
      [sheet]: "application/vnd.google-apps.spreadsheet",
      [pdf]: "application/pdf",
    };
    const info = (id: string) => ({
      id,
      name:
        id === doc
          ? "Business strategy"
          : id === sheet
            ? "Financial model"
            : "Services plan",
      mimeType: types[id],
      modifiedTime:
        options.changed && ++metadataCalls > 1
          ? "2026-11-10T00:00:00Z"
          : "2026-11-09T00:00:00Z",
      capabilities: { canDownload: true },
    });
    const id = u.pathname.split("/")[4];
    if (options.fail && id === options.fail)
      return new Response("private-provider-error", { status: 403 });
    if (u.pathname === "/drive/v3/files")
      return Response.json({
        files: [info(doc), info(sheet), info(pdf)],
        nextPageToken: "more",
      });
    if (
      u.pathname.endsWith("/export") ||
      u.searchParams.get("alt") === "media"
    ) {
      if (options.large) return new Response("x".repeat(2_000_001));
      if (id === sheet) {
        expect(u.searchParams.get("mimeType")).toBe(
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
        return new Response(
          new Uint8Array(
            await fs.readFile("tests/fixtures/synthetic-forecast.xlsx"),
          ),
        );
      }
      if (id === pdf)
        return new Response(
          new Uint8Array(
            await fs.readFile("tests/fixtures/synthetic-services.pdf"),
          ),
        );
      expect(u.searchParams.get("mimeType")).toBe("text/plain");
      return new Response("Quasarbudget owner readiness and revenue strategy.");
    }
    return Response.json(info(id));
  }) as typeof fetch;
  return { transport, calls };
}
test.describe("Google accounts and selected Drive snapshots", () => {
  let dir: string, old: string | undefined;
  test.beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "nexus-workspace-"));
    old = process.env.GW_SYNC_DATA_DIR;
    process.env.GW_SYNC_DATA_DIR = dir;
    await fs.writeFile(
      path.join(dir, "sync-config.json"),
      JSON.stringify({
        version: 1,
        pairingHash: "a".repeat(64),
        signingSecret: "b".repeat(64),
      }),
    );
    await fs.writeFile(
      path.join(dir, "google-oauth.json"),
      JSON.stringify({
        clientId: "synthetic.apps.googleusercontent.com",
        clientSecret: "synthetic-client-secret",
      }),
    );
  });
  test.afterEach(async () => {
    if (old === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = old;
    await fs.rm(dir, { recursive: true, force: true });
  });
  test("adding an account preserves the first, scope upgrades bind identity, partial grants preserve credentials", async () => {
    const first = await connect("one@example.test", "calendar");
    await connect("two@example.test", "calendar");
    expect((await googleAccounts()).map((a) => a.email)).toEqual([
      "one@example.test",
      "two@example.test",
    ]);
    const upgrade = await beginGoogle("drive", first.id),
      url = new URL(upgrade.url);
    expect(url.searchParams.get("scope")).toContain(GOOGLE_SCOPE);
    expect(url.searchParams.get("scope")).toContain(DRIVE_SCOPE);
    expect(url.searchParams.get("login_hint")).toBe("one@example.test");
    const before = await fs.readFile(
      path.join(dir, "google-tokens.json"),
      "utf8",
    );
    await expect(
      finishGoogle(upgrade.state, upgrade.state, "partial", (async () =>
        Response.json({
          access_token: "not-saved",
          refresh_token: "not-saved",
          expires_in: 3600,
          scope: DRIVE_SCOPE,
        })) as typeof fetch),
    ).rejects.toThrow("preserved");
    expect(
      await fs.readFile(path.join(dir, "google-tokens.json"), "utf8"),
    ).toBe(before);
    await connect("one@example.test", "drive", first.id);
    expect(
      (await googleAccounts()).find((a) => a.id === first.id),
    ).toMatchObject({ calendar: true, drive: true });
    const mismatch = await beginGoogle("calendar", first.id);
    await expect(
      finishGoogle(mismatch.state, mismatch.state, "wrong", (async (
        input: any,
      ) =>
        String(input).includes("/token")
          ? Response.json({
              access_token: "wrong",
              refresh_token: "wrong",
              expires_in: 3600,
              scope: GOOGLE_SCOPE + " " + DRIVE_SCOPE,
            })
          : Response.json({
              email: "other@example.test",
              email_verified: true,
            })) as typeof fetch),
    ).rejects.toThrow("different Google account");
    expect((await googleAccounts()).length).toBe(2);
    expect(
      await fs.readFile(path.join(dir, "google-tokens.json"), "utf8"),
    ).not.toContain("access-one");
  });
  test("legacy encrypted Calendar credentials stay usable and are backed up only on mutation", async () => {
    const key = createHash("sha256")
        .update("nexus-google-v1:" + "b".repeat(64))
        .digest(),
      iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", key, iv),
      data = Buffer.concat([
        cipher.update(
          JSON.stringify({
            access: "legacy-access",
            refresh: "legacy-refresh",
            expires: Date.now() + 3600000,
            email: "legacy@example.test",
          }),
          "utf8",
        ),
        cipher.final(),
      ]);
    const raw = JSON.stringify({
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: data.toString("base64"),
    });
    await fs.writeFile(path.join(dir, "google-tokens.json"), raw);
    expect((await googleStatus()).email).toBe("legacy@example.test");
    expect(
      await fs.readFile(path.join(dir, "google-tokens.json"), "utf8"),
    ).toBe(raw);
    await connect("second@example.test", "calendar");
    expect((await googleAccounts()).length).toBe(2);
    expect(
      await fs.readFile(path.join(dir, "google-tokens-v1.backup.json"), "utf8"),
    ).toBe(raw);
    const legacy = (await googleAccounts()).find(
      (a) => a.email === "legacy@example.test",
    )!;
    await disconnectGoogle(legacy.id);
    expect((await googleAccounts()).map((a) => a.email)).toEqual([
      "second@example.test",
    ]);
    await expect(
      fs.stat(path.join(dir, "google-tokens-v1.backup.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
  test("both primary calendars contribute and shared invitations deduplicate; failed accounts warn", async () => {
    await connect("one@example.test", "calendar");
    await connect("two@example.test", "calendar");
    const transport = (async (_u: any, init: any) =>
      Response.json({
        items: [
          {
            iCalUID: "shared",
            summary: "Meeting",
            start: { dateTime: "2026-11-09T14:00:00Z" },
            end: { dateTime: "2026-11-09T15:00:00Z" },
          },
          {
            id: init.headers.Authorization.includes("one@") ? "one" : "two",
            summary: "Unique",
            start: { dateTime: "2026-11-09T16:00:00Z" },
            end: { dateTime: "2026-11-09T17:00:00Z" },
          },
        ],
      })) as typeof fetch;
    const result = await googleEvents(
      defaultBriefSettings(),
      new Date("2026-11-09T10:00:00Z"),
      transport,
    );
    expect(result.events).toHaveLength(3);
    expect(result.warnings).toEqual([]);
    const partial = await googleEvents(
      defaultBriefSettings(),
      new Date("2026-11-09T10:00:00Z"),
      (async (u: any, i: any) =>
        i.headers.Authorization.includes("two@")
          ? new Response("hidden", { status: 403 })
          : transport(u, i)) as typeof fetch,
    );
    expect(partial.warnings.join(" ")).toContain("two@example.test");
    expect(partial.events).toHaveLength(2);
  });
  test("Drive browse uses fixed origins, escaped name filters and explicit selections", async () => {
    const a = await connect("one@example.test");
    const { transport, calls } = driveTransport();
    const list = await browseDrive(a.id, "owner's \\ plan", transport);
    expect(list.files).toHaveLength(3);
    expect(list.partial).toBe(true);
    expect(new URL(calls[0]).searchParams.get("q")).toContain(
      "owner\\'s \\\\ plan",
    );
    expect((await driveDocuments()).documents).toEqual([]);
    await selectDriveFile(a.id, doc, transport);
    expect((await driveStatus()).selected).toHaveLength(1);
    expect((await driveDocuments()).documents).toEqual([]);
    await expect(
      selectDriveFile(a.id, "https://external.example", transport),
    ).rejects.toThrow("identifier");
    expect(
      calls.every((u) => new URL(u).origin === "https://www.googleapis.com"),
    ).toBe(true);
  });
  test("Docs text, Sheets workbook and PDFs become bounded searchable snapshots with provenance", async () => {
    const a = await connect("one@example.test");
    const { transport } = driveTransport();
    for (const id of [doc, sheet, pdf])
      await selectDriveFile(a.id, id, transport);
    const result = await refreshDrive(transport);
    expect(result.entries).toHaveLength(3);
    expect(result.warnings.join(" ")).toContain("not recalculated");
    expect(
      (await searchDriveIndex("Quasarbudget")).matches[0].source,
    ).toContain("one@example.test / Business strategy");
    expect((await driveDocuments()).warning).toContain("snapshots");
    const raw = await fs.readFile(
      path.join(dir, "google-drive-index.json"),
      "utf8",
    );
    expect(raw).not.toContain("access-one");
    await removeDriveFile(a.id, doc);
    expect((await driveDocuments()).documents).toEqual([]);
    expect((await driveStatus()).selected).toHaveLength(2);
  });
  test("failed, changed or oversized exports withhold previous text instead of retaining stale success", async () => {
    const a = await connect("one@example.test");
    const normal = driveTransport();
    await selectDriveFile(a.id, doc, normal.transport);
    await refreshDrive(normal.transport);
    for (const options of [{ fail: doc }, { large: true }, { changed: true }]) {
      const result = await refreshDrive(driveTransport(options).transport);
      expect(result.entries).toEqual([]);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect((await driveDocuments()).documents).toEqual([]);
    }
  });
  test("disconnecting one account preserves the other, purges snapshots and prevents in-flight cache resurrection", async () => {
    const a = await connect("one@example.test"),
      b = await connect("two@example.test");
    const normal = driveTransport();
    await selectDriveFile(a.id, doc, normal.transport);
    await selectDriveFile(b.id, sheet, normal.transport);
    await refreshDrive(normal.transport);
    await disconnectGoogle(a.id);
    expect((await googleAccounts()).map((a) => a.id)).toEqual([b.id]);
    expect((await driveDocuments()).documents).toEqual([]);
    const after = await refreshDrive(normal.transport);
    expect(after.entries.map((e) => e.accountId)).toEqual([b.id]);
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((r) => (release = r)),
      seen = new Promise<void>((r) => (entered = r));
    const refreshing = refreshDrive((async (u: any, i: any) => {
      if (String(u).includes("/export")) {
        entered();
        await gate;
      }
      return normal.transport(u, i);
    }) as typeof fetch);
    await seen;
    await disconnectGoogle(b.id);
    release();
    await refreshing;
    expect((await driveDocuments()).documents).toEqual([]);
  });
  test("corrupt credentials and selection data fail closed without silently replacing files", async () => {
    await fs.writeFile(path.join(dir, "google-tokens.json"), "broken");
    await expect(beginGoogle()).rejects.toThrow("preserved");
    expect(
      await fs.readFile(path.join(dir, "google-tokens.json"), "utf8"),
    ).toBe("broken");
    await fs.rm(path.join(dir, "google-tokens.json"));
    await connect("one@example.test");
    await fs.writeFile(path.join(dir, "google-drive-selected.json"), "broken");
    await expect(refreshDrive(driveTransport().transport)).rejects.toThrow(
      "preserved",
    );
  });
  test("four-account cap and a one-account token refresh preserve all other connections", async () => {
    const a = await connect("one@example.test", "calendar", undefined, 1);
    for (const email of [
      "two@example.test",
      "three@example.test",
      "four@example.test",
    ])
      await connect(email, "calendar");
    await expect(connect("five@example.test", "calendar")).rejects.toThrow(
      "four Google accounts",
    );
    expect((await googleAccounts()).length).toBe(4);
    const renewed = await googleAccessToken(a.id, GOOGLE_SCOPE, (async () =>
      Response.json({
        access_token: "renewed-one",
        expires_in: 3600,
        scope: GOOGLE_SCOPE,
      })) as typeof fetch);
    expect(renewed).toBe("renewed-one");
    expect((await googleAccounts()).length).toBe(4);
    await disconnectGoogle(a.id);
    expect((await googleAccounts()).length).toBe(3);
    await expect(googleAccessToken(a.id, GOOGLE_SCOPE)).rejects.toThrow(
      "not connected",
    );
  });
});
