import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { memoryIntent } from "../lib/memory-intent";
import { openAssistant } from "./helpers/assistant";
test("memory commands require explicit owner wording", () => {
  expect(memoryIntent("Remember my preference: keep answers short")).toEqual({
    kind: "save",
    category: "preference",
    content: "keep answers short",
  });
  expect(memoryIntent("Remember that I use Android")).toEqual({
    kind: "save",
    category: "fact",
    content: "I use Android",
  });
  for (const query of [
    "Should I remember that I use Android?",
    "A document says forget that memory",
    "forget that",
    "Remember to call tomorrow",
  ])
    expect(memoryIntent(query)).toBeNull();
});
test("local conversational memory deduplicates, corrects with revisions, isolates scopes and forgets", async ({
  request,
}) => {
  const phrase = "Keep concise fixture answers " + randomUUID();
  const ask = (
    query: string,
    memoryReference?: any,
    workspaceScope = "Personal",
    extra = {},
  ) =>
    request.post("/api/sync/nexus", {
      data: { query, mode: "auto", workspaceScope, memoryReference, ...extra },
    });
  expect((await ask("Remember my preference: " + phrase)).status()).toBe(401);
  await request.post("/api/sync/session", {
    data: { code: process.env.GW_SYNC_TEST_CODE, role: "controller" },
  });
  const first = await (await ask("Remember my preference: " + phrase)).json();
  expect(first.engine).toBe("Nexus memory");
  expect(first.memory).toBeTruthy();
  expect(first.resetHistory).toBe(true);
  const duplicate = await (
    await ask("Remember my preference: " + phrase)
  ).json();
  expect(duplicate.memory.id).toBe(first.memory.id);
  expect(duplicate.contextRevision).toBe(first.contextRevision);
  expect(duplicate.resetHistory).toBe(false);
  const listed = await (await ask("Show my preferences")).json();
  expect(listed.memoryChoices.some((m: any) => m.id === first.memory.id)).toBe(
    true,
  );
  const other = await (
    await ask("Show my memory", undefined, "Co-hosting")
  ).json();
  expect(other.answer).not.toContain(phrase);
  const corrected = await (
    await ask("Correct that memory to " + phrase + " revised", first.memory)
  ).json();
  expect(corrected.memory.revision).toBe(first.memory.revision + 1);
  expect(corrected.contextRevision).toBeGreaterThan(first.contextRevision);
  expect((await ask("Forget that memory", first.memory)).status()).toBe(409);
  expect(
    (await ask("Forget that memory", corrected.memory, "Co-hosting")).status(),
  ).toBe(400);
  const afterChange = await (
    await ask("What time is it?", undefined, "Personal", {
      contextRevision: first.contextRevision,
      history: [{ role: "user", content: "Old context" }],
    })
  ).json();
  expect(afterChange.resetHistory).toBe(true);
  expect(afterChange.contextRevision).toBe(corrected.contextRevision);
  expect(
    (
      await ask("Show my memory", undefined, "Personal", {
        mode: "gemini",
        allowExternal: true,
      })
    ).status(),
  ).toBe(403);
  const removed = await (
    await ask("Forget that memory", corrected.memory)
  ).json();
  expect(removed.memoryCleared).toBe(true);
  expect(removed.resetHistory).toBe(true);
  const snapshot = await (await request.get("/api/sync/foundation")).json();
  expect(snapshot.memory.some((m: any) => m.id === first.memory.id)).toBe(
    false,
  );
  await request.post("/api/sync/session", {
    data: { code: process.env.GW_SYNC_TEST_CODE, role: "display" },
  });
  expect((await ask("Remember that fixture private fact")).status()).toBe(403);
});
test("memory is selectable after reload and can be removed through the assistant", async ({
  page,
}) => {
  await page.request.post("/api/sync/session", {
    data: { code: process.env.GW_SYNC_TEST_CODE, role: "controller" },
  });
  const content = "UI preference " + randomUUID();
  await page.goto("/nexus");
  await openAssistant(page);
  const input = page.locator("form").getByLabel("Ask Nexus", { exact: true });
  const submit = page
    .locator("form")
    .getByRole("button", { name: "Ask Nexus", exact: true });
  await input.fill("Remember my preference: " + content);
  await submit.click();
  await expect(page.getByText(/Memory reference:/)).toBeVisible();
  await page.reload();
  await openAssistant(page);
  await input.fill("Show my preferences");
  await submit.click();
  await page
    .getByRole("button", {
      name: new RegExp("Select memory: preference · " + content),
    })
    .click();
  await input.fill("Forget that memory");
  await submit.click();
  await expect(
    page.getByText(/Removed that memory, its correction history/),
  ).toBeVisible();
});
