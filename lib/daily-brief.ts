export type BriefTask = {
  id: string;
  title: string;
  due: string;
  priority: "Normal" | "High";
  done: boolean;
};
export type BriefSettings = {
  revision: number;
  enabled: boolean;
  company: string;
  industry: "Co-hosting" | "Aviation" | "Security Operations" | "General";
  timezone: string;
  calendars: string[];
  deepStart: string;
  deepEnd: string;
  email: boolean;
  tasks: BriefTask[];
};
export type CalendarItem = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  people: string[];
  prep: string;
  calendar: string;
  declined?: boolean;
  transparent?: boolean;
};
export const defaultBriefSettings = (): BriefSettings => ({
  revision: 0,
  enabled: false,
  company: "Gulf Wing Co-hosting",
  industry: "Co-hosting",
  timezone: "America/New_York",
  calendars: ["primary"],
  deepStart: "08:00",
  deepEnd: "11:00",
  email: true,
  tasks: [],
});
export function validBriefSettings(v: unknown): BriefSettings {
  const s = v as BriefSettings;
  const text = (x: unknown, n: number) =>
    typeof x === "string" &&
    x.trim().length > 0 &&
    x.length <= n &&
    !/[\r\n\x00]/.test(x);
  if (
    !s ||
    !Number.isSafeInteger(s.revision) ||
    s.revision < 0 ||
    typeof s.enabled !== "boolean" ||
    typeof s.email !== "boolean" ||
    !text(s.company, 100) ||
    !["Co-hosting", "Aviation", "Security Operations", "General"].includes(
      s.industry,
    ) ||
    !text(s.timezone, 80) ||
    !Array.isArray(s.calendars) ||
    !s.calendars.length ||
    s.calendars.length > 5 ||
    s.calendars.some((c) => !text(c, 254)) ||
    new Set(s.calendars).size !== s.calendars.length ||
    !Array.isArray(s.tasks) ||
    s.tasks.length > 100
  )
    throw Error("Invalid daily brief settings.");
  try {
    new Intl.DateTimeFormat("en", { timeZone: s.timezone }).format();
  } catch {
    throw Error("Choose a valid IANA timezone.");
  }
  const hh = (t: unknown) =>
    typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
  if (!hh(s.deepStart) || !hh(s.deepEnd) || s.deepStart >= s.deepEnd)
    throw Error("Choose a valid same-day deep-work block.");
  const ids = new Set<string>();
  const tasks = s.tasks.map((t) => {
    if (
      !t ||
      !text(t.id, 80) ||
      ids.has(t.id) ||
      !text(t.title, 160) ||
      typeof t.done !== "boolean" ||
      !["Normal", "High"].includes(t.priority) ||
      typeof t.due !== "string" ||
      (t.due &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(t.due) ||
          !Number.isFinite(Date.parse(t.due)) ||
          new Date(t.due).toISOString().slice(0, 10) !== t.due))
    )
      throw Error("Invalid real task.");
    ids.add(t.id);
    return {
      id: t.id,
      title: t.title.trim(),
      due: t.due,
      priority: t.priority,
      done: t.done,
    };
  });

  return {
    revision: s.revision,
    enabled: s.enabled,
    company: s.company.trim(),
    industry: s.industry,
    timezone: s.timezone,
    calendars: s.calendars,
    deepStart: s.deepStart,
    deepEnd: s.deepEnd,
    email: s.email,
    tasks,
  };
}
export function localParts(now: Date, zone: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
    weekday: p.weekday,
  };
}
export function addDays(day: string, n: number) {
  return new Date(Date.parse(day + "T12:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function zonedInstant(day: string, time: string, zone: string) {
  let value = Date.parse(day + "T" + time + ":00Z");
  const wanted = value;
  for (let i = 0; i < 4; i++) {
    const p = localParts(new Date(value), zone);
    const seen = Date.parse(p.date + "T" + p.time + ":00Z");
    if (seen === wanted) return new Date(value).toISOString();
    value += wanted - seen;
  }
  throw Error(
    "This local time is ambiguous or unavailable; review timezone settings.",
  );
}
const short = (s: string, n = 110) =>
  s
    .replace(/<[^>]*>/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, n);
export function composeBrief(
  settings: BriefSettings,
  events: CalendarItem[],
  now: Date,
  candidates: {
    title: string;
    due: string;
    priority?: string;
    reason: string;
  }[] = [],
  warnings: string[] = [],
) {
  const p = localParts(now, settings.timezone),
    monday = p.weekday === "Mon",
    weekEnd = addDays(p.date, 7);
  const usable = events.filter(
    (e) =>
      !e.declined &&
      Number.isFinite(Date.parse(e.start)) &&
      Number.isFinite(Date.parse(e.end)) &&
      Date.parse(e.end) > Date.parse(e.start),
  );
  const dayStart = Date.parse(zonedInstant(p.date, "00:00", settings.timezone)),
    dayEnd = Date.parse(
      zonedInstant(addDays(p.date, 1), "00:00", settings.timezone),
    );
  const today = usable
    .filter((e) => Date.parse(e.start) < dayEnd && Date.parse(e.end) > dayStart)
    .sort((a, b) => a.start.localeCompare(b.start));
  const time = (iso: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: settings.timezone,
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  const lines = [
    `NEXUS | ${short(settings.company, 60)} | ${p.date}`,
    `Weekday brief · 5 a.m. target · ${settings.timezone}`,
    "TODAY",
  ];
  if (!today.length)
    lines.push("No calendar items found in the selected calendars.");
  today
    .slice(0, 6)
    .forEach((e) =>
      lines.push(
        `${e.allDay ? "All day" : time(e.start) + "–" + time(e.end)} ${short(e.title, 65)} | ${short(e.people.join(", ") || "No attendee details", 50)} | Prep: ${short(e.prep || "Suggested: review agenda and related records", 70)}`,
      ),
    );
  if (today.length > 6)
    lines.push(`+${today.length - 6} more items; review Google Calendar.`);
  const conflicts: string[] = [];
  for (let i = 0; i < today.length; i++)
    for (let j = i + 1; j < today.length; j++) {
      const a = today[i],
        b = today[j];
      if (
        a.id === b.id ||
        a.allDay ||
        b.allDay ||
        a.transparent ||
        b.transparent
      )
        continue;
      if (
        Date.parse(a.start) < Date.parse(b.end) &&
        Date.parse(b.start) < Date.parse(a.end)
      )
        conflicts.push(short(a.title, 35) + " / " + short(b.title, 35));
    }
  lines.push(
    "CONFLICTS",
    ...(conflicts.length
      ? conflicts.slice(0, 2)
      : ["No timed overlaps found in available selected-calendar data."]),
  );
  if (conflicts.length > 2)
    lines.push(`+${conflicts.length - 2} other overlaps; review calendar.`);
  const deepStart = Date.parse(
      zonedInstant(p.date, settings.deepStart, settings.timezone),
    ),
    deepEnd = Date.parse(
      zonedInstant(p.date, settings.deepEnd, settings.timezone),
    );
  const admin = today.filter(
    (e) =>
      !e.allDay &&
      !e.transparent &&
      /\b(admin|inbox|email|filing|receipt|paperwork|routine schedul|contact update)/i.test(
        e.title,
      ) &&
      Date.parse(e.start) < deepEnd &&
      Date.parse(e.end) > deepStart,
  );
  lines.push(`DEEP WORK ${settings.deepStart}–${settings.deepEnd}`);
  if (admin.length) {
    lines.push(
      `Possible admin intrusion: ${admin
        .slice(0, 2)
        .map((e) => short(e.title, 40))
        .join("; ")}.`,
    );
    lines.push(
      "Proposal: batch movable admin after the protected block; confirm urgency and attendee availability before moving anything.",
    );
  } else
    lines.push(
      "No title-matched admin intrusion found. Unclassified meetings still need review.",
    );
  const tasks = [
    ...settings.tasks
      .filter((t) => !t.done)
      .map((t) => ({ ...t, reason: "Saved real task" })),
    ...candidates,
    ...usable
      .filter((e) => /\b(deadline|due|submit)\b/i.test(e.title))
      .map((e) => ({
        title: e.title,
        due: localParts(new Date(e.start), settings.timezone).date,
        priority: "Normal",
        reason: "Calendar deadline",
      })),
  ];
  const ranked = tasks
    .map((t) => ({
      ...t,
      score:
        (t.due && t.due <= p.date ? 100 : 0) +
        (t.priority === "High" ? 30 : 0) +
        (t.due && t.due < weekEnd ? 15 : 0),
    }))
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  const seen = new Set<string>(),
    top = ranked
      .filter((t) => {
        const key = t.title.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 3);
  lines.push("TOP THREE");
  top.forEach((t, i) =>
    lines.push(
      `${i + 1}. ${short(t.title, 75)}${t.due ? " · " + t.due : ""} — ${short(t.reason, 50)}`,
    ),
  );
  if (!top.length)
    lines.push(
      "No saved actionable priorities. Add real tasks or dated business work.",
    );
  if (monday) {
    lines.push("WEEK AHEAD · MON–SUN");
    for (let i = 0; i < 7; i++) {
      const day = addDays(p.date, i),
        start = Date.parse(zonedInstant(day, "00:00", settings.timezone)),
        end = Date.parse(
          zonedInstant(addDays(day, 1), "00:00", settings.timezone),
        );
      const count = usable.filter(
        (e) => Date.parse(e.start) < end && Date.parse(e.end) > start,
      ).length;
      lines.push(
        `${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]} ${day}: ${count} calendar items`,
      );
    }
  }
  lines.push(
    "Priorities protect deadlines/customer commitments; financial gains are not verified. Calendar proposals only; no events changed.",
  );
  for (const w of warnings.slice(0, 2)) lines.push("Caution: " + short(w, 160));
  const text = lines.join("\n");
  return {
    date: p.date,
    timezone: settings.timezone,
    monday,
    text,
    meetings: today.length,
    conflicts: conflicts.length,
    adminIntrusions: admin.length,
  };
}
