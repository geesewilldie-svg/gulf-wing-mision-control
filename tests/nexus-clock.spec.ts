import { test, expect } from "@playwright/test";
import { clockContext, directClockAnswer } from "../lib/server/nexus-clock";
test("clock uses device zone across midnight and daylight saving", () => {
  const instant = new Date("2026-11-18T02:30:00Z");
  expect(clockContext("America/New_York", instant).date).toBe("Tuesday, November 17, 2026");
  expect(clockContext("Asia/Tokyo", instant).date).toBe("Wednesday, November 18, 2026");
  expect(clockContext("America/New_York", new Date("2026-07-01T12:00:00Z")).time).toContain("EDT");
  expect(clockContext("America/New_York", instant).time).toContain("EST");
  expect(clockContext("bad-zone", instant).timeZone).toBe("America/New_York");
});
test("only direct current-clock questions bypass reasoning", () => {
  const clock = clockContext("UTC", new Date("2026-11-18T12:00:00Z"));
  for (const query of ["What is the date and time?", "Nexus, what time is it?", "What's today's date?", "What day is today?"])
    expect(directClockAnswer(query, clock)).toContain("November 18, 2026");
  for (const query of ["What time is my meeting?", "What is the date of my appointment?", "What is the time in London?", "Tell me the time and delete my files"])
    expect(directClockAnswer(query, clock)).toBeNull();
});
test("paired clock answers need no local model", async ({ request }) => {
  expect((await request.post("/api/sync/nexus", { data: { query: "What time is it?", mode: "auto" } })).status()).toBe(401);
  await request.post("/api/sync/session", { data: { code: process.env.GW_SYNC_TEST_CODE, role: "controller" } });
  const result = await request.post("/api/sync/nexus", { data: { query: "What is the date and time?", mode: "auto", timeZone: "Asia/Tokyo" } });
  expect(result.ok()).toBeTruthy();
  const answer = await result.json();
  expect(answer.engine).toBe("Nexus clock");
  expect(answer.answer).toContain("Asia/Tokyo");
  expect(answer.routing.selected).toEqual([]);
});
