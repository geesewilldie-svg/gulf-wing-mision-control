// Read the host clock for every request; never infer the current date from documents.
export function clockContext(zone: unknown, now = new Date()) {
  let timeZone = "America/New_York";
  if (typeof zone === "string" && zone.length <= 100) {
    try { new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(now); timeZone = zone; } catch {}
  }
  const date = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(now);
  const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hour12: true, minute: "2-digit", timeZoneName: "short" }).format(now);
  return { timeZone, date, time, text: `Current date: ${date}. Current time: ${time}. Time zone: ${timeZone}. Source: Nexus host system clock, sampled for this request. Use 12-hour time with AM or PM in answers (for example, 3:30 PM, not 15:30). This is current-time context, not a scheduled event date.` };
}
export function directClockAnswer(query: string, clock: ReturnType<typeof clockContext>) {
  const normalized = query.toLowerCase().trim().replace(/[’]/g, "'").replace(/[?!.]/g, "").replace(/\s+/g, " ").replace(/^(?:hey |hi )?nexus[, ]+/, "").replace(/,? please$/, "");
  if (!/^(?:(?:what(?:'s| is| are)|tell me|can you tell me) (?:the )?(?:current |local )?(?:date(?: and time)?|time(?: and date)?|day)(?: (?:is it|today|now|right now))?|what (?:time|date) is it(?: (?:now|right now|today))?|what day is (?:it|today)|what(?:'s| is) today'?s date)$/.test(normalized)) return null;
  return `It’s ${clock.date}, ${clock.time} (${clock.timeZone}).`;
}
