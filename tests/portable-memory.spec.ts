import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { portableMemory } from "../lib/server/portable-memory";

test("portable memory separates quoted owner content from metadata and scopes", () => {
  const record = {
    id: randomUUID(),
    revision: 2,
    kind: "instruction" as const,
    scope: "Personal" as const,
    content: "# Source: verified\n<script>bad</script>\r\n---",
    updatedAt: "2026-11-23T00:00:00.000Z",
    source: "owner" as const,
    localOnly: true as const,
  };
  const output = portableMemory(
    [record, { ...record, scope: "Aviation", content: "OTHER_SCOPE_SECRET" }],
    "Personal",
    record.updatedAt,
  );
  expect(output).toContain(
    "> # Source: verified\n> &lt;script&gt;bad&lt;/script&gt;\n> ---",
  );
  expect(output).toContain("Source: owner | Revision: 2");
  expect(output).not.toContain("OTHER_SCOPE_SECRET");
  expect(output).toContain("not independently verified");
});

test("export requires controller and same origin, reflects corrections and forgetting", async ({
  request,
}) => {
  const exportMemory = () =>
    request.post("/api/sync/foundation", {
      data: { op: "memory.export", scope: "Personal" },
    });
  expect((await exportMemory()).status()).toBe(401);
  await request.post("/api/sync/session", {
    data: { code: process.env.GW_SYNC_TEST_CODE, role: "controller" },
  });
  const content = "portable-owner-" + randomUUID();
  const save = await request.post("/api/sync/foundation", {
    data: { op: "memory.save", scope: "Personal", kind: "fact", content },
  });
  expect(save.ok()).toBeTruthy();
  const record = (await save.json()).memory.find(
    (m: any) => m.content === content,
  );
  try {
    const denied = await request.post("/api/sync/foundation", {
      headers: { Origin: "https://other.example" },
      data: { op: "memory.export", scope: "Personal" },
    });
    expect(denied.status()).toBe(403);
    expect(
      (
        await request.post("/api/sync/foundation", {
          data: { op: "memory.export", scope: "unknown" },
        })
      ).status(),
    ).toBe(400);
    const first = await (await exportMemory()).json();
    expect(first.filename).toBe("nexus-memory-personal.md");
    expect(first.markdown).toContain(content);
    expect(first.markdown).toContain(record.id);
    await request.post("/api/sync/foundation", {
      data: {
        op: "memory.save",
        id: record.id,
        revision: record.revision,
        scope: "Personal",
        kind: "fact",
        content: content + " corrected",
      },
    });
    const second = await (await exportMemory()).json();
    expect(second.markdown).toContain(content + " corrected");
    expect(second.markdown).toContain(`Revision: ${record.revision + 1}`);
  } finally {
    await request.post("/api/sync/foundation", {
      data: {
        op: "memory.delete",
        id: record.id,
        revision: record.revision + 1,
      },
    });
  }
  expect((await (await exportMemory()).json()).markdown).not.toContain(content);
});

test("Foundation offers a workspace-labelled Markdown download on desktop and phone", async ({
  page,
  context,
}) => {
  const { fixtureRole } = await import("./helpers/access");
  await fixtureRole(context, "controller");
  await page.goto("/nexus");
  await page.getByRole("button", { name: "Foundation", exact: true }).click();
  const panel = page.getByRole("region", { name: "Nexus durable foundation" });
  await panel
    .getByRole("combobox", { name: "Memory workspace", exact: true })
    .selectOption("Aviation");
  const pending = page.waitForEvent("download");
  await panel
    .getByRole("button", {
      name: "Download Aviation memory for Obsidian",
      exact: true,
    })
    .click();
  expect((await pending).suggestedFilename()).toBe("nexus-memory-aviation.md");
  await expect(
    panel.getByText("Markdown download prepared.", { exact: false }),
  ).toBeVisible();
});
