import {
  addDays,
  localParts,
  zonedInstant,
  type BriefSettings,
  type CalendarItem,
} from "../daily-brief";
import { SyncError } from "./sync-store";
import {
  googleAccounts,
  googleAccessToken,
  googleJson,
  GOOGLE_SCOPE,
  type GoogleTransport,
} from "./google-accounts";
export {
  beginGoogle,
  finishGoogle,
  googleStatus,
  disconnectGoogle,
  GOOGLE_SCOPE,
  GOOGLE_REDIRECT,
} from "./google-accounts";
export function parseGoogleEvent(
  raw: any,
  calendar: string,
  zone: string,
): CalendarItem | null {
  if (
    !raw ||
    raw.status === "cancelled" ||
    raw.attendees?.some((a: any) => a.self && a.responseStatus === "declined")
  )
    return null;
  const allDay = !!raw.start?.date;
  const instant = (v: any) =>
    v?.dateTime || (v?.date ? zonedInstant(v.date, "00:00", zone) : "");
  let start, end;
  try {
    start = instant(raw.start);
    end = instant(raw.end);
  } catch {
    return null;
  }
  if (
    !Number.isFinite(Date.parse(start)) ||
    !Number.isFinite(Date.parse(end)) ||
    Date.parse(end) <= Date.parse(start)
  )
    return null;
  const clean = (v: unknown, n: number) =>
    typeof v === "string"
      ? v
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, n)
      : "";
  return {
    id: clean(raw.iCalUID || raw.id, 500) + ":" + start,
    title: clean(raw.summary, 200) || "Untitled calendar item",
    start,
    end,
    allDay,
    people: (Array.isArray(raw.attendees) ? raw.attendees : [])
      .filter((a: any) => !a.self && a.responseStatus !== "declined")
      .slice(0, 10)
      .map((a: any) => clean(a.displayName || a.email, 100)),
    prep: clean(raw.description, 300),
    calendar,
    transparent: raw.transparency === "transparent",
  };
}

export async function googleEvents(
  settings: BriefSettings,
  now: Date,
  transport: GoogleTransport = fetch,
) {
  const accounts = (await googleAccounts()).filter((a) => a.calendar);
  if (!accounts.length)
    throw new SyncError(409, "Google Calendar is not connected.");
  const day = localParts(now, settings.timezone).date,
    events: CalendarItem[] = [],
    warnings: string[] = [];
  let succeeded = 0,
    totalPages = 0;
  for (const account of accounts) {
    try {
      const token = await googleAccessToken(
        account.id,
        GOOGLE_SCOPE,
        transport,
      );
      for (const calendar of settings.calendars) {
        let next = "",
          pages = 0;
        do {
          if (totalPages >= 20) {
            warnings.push(
              "Combined calendar result limit reached; availability is incomplete.",
            );
            break;
          }
          const url = new URL(
            "https://www.googleapis.com/calendar/v3/calendars/" +
              encodeURIComponent(calendar) +
              "/events",
          );
          Object.entries({
            singleEvents: "true",
            orderBy: "startTime",
            maxResults: "250",
            timeMin: zonedInstant(day, "00:00", settings.timezone),
            timeMax: zonedInstant(addDays(day, 7), "00:00", settings.timezone),
            timeZone: settings.timezone,
            ...(next ? { pageToken: next } : {}),
          }).forEach(([k, v]) => url.searchParams.set(k, v));
          const data = await googleJson(
            url.toString(),
            { headers: { Authorization: "Bearer " + token } },
            transport,
          );
          if (!Array.isArray(data.items))
            throw new SyncError(
              502,
              "Google Calendar returned an invalid event list.",
            );
          for (const raw of data.items) {
            const item = parseGoogleEvent(
              raw,
              account.email + " · " + calendar,
              settings.timezone,
            );
            if (item) events.push(item);
          }
          next =
            typeof data.nextPageToken === "string" ? data.nextPageToken : "";
          pages++;
          totalPages++;
          succeeded++;
        } while (next && pages < 4);
        if (next)
          warnings.push(
            "Calendar result limit reached for " +
              account.email +
              "; review the full calendar in Google.",
          );
      }
    } catch {
      warnings.push(
        "Calendar unavailable for " +
          account.email +
          ". This account's meetings and conflicts may be missing.",
      );
    }
  }
  if (!succeeded)
    throw new SyncError(
      502,
      "Connected Google calendars could not be read. Reconnect or check API permissions; availability is unknown.",
    );
  // Shared invitations use iCalUID plus occurrence start, so the same meeting is counted once.
  return {
    events: [...new Map(events.map((e) => [e.id, e])).values()],
    warnings: [...new Set(warnings)],
  };
}
