import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { composeBrief, localParts, type BriefSettings } from "../daily-brief";
import { loadBriefSettings, briefFile } from "./brief-store";
import { loadBusiness } from "./business-store";
import { loadOperations } from "./venture-store";
import { SyncError } from "./sync-store";
export type MorningBrief = {
  version: 1;
  date: string;
  timezone: string;
  generatedAt: string;
  late: boolean;
  text: string;
  sources: string[];
};
const location = () =>
  path.join(path.dirname(briefFile()), "morning-brief.json");
const shared = globalThis as typeof globalThis & {
  nexusMorningQueue?: Promise<unknown>;
};
export function morningDue(s: BriefSettings, now: Date) {
  const p = localParts(now, s.timezone);
  return s.enabled && !["Sat", "Sun"].includes(p.weekday) && p.time >= "05:00";
}
export async function readMorning(): Promise<MorningBrief | null> {
  try {
    const value = JSON.parse(await fs.readFile(location(), "utf8"));
    if (
      value.version !== 1 ||
      typeof value.text !== "string" ||
      typeof value.date !== "string" ||
      typeof value.timezone !== "string"
    )
      throw Error();
    return value;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new SyncError(
      503,
      "Saved brief cannot be read. Existing data is preserved.",
    );
  }
}
export async function buildMorning(
  now = new Date(),
): Promise<MorningBrief | null> {
  const work = (shared.nexusMorningQueue ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const s = await loadBriefSettings();
      if (!morningDue(s, now)) return null;
      const p = localParts(now, s.timezone),
        old = await readMorning();
      if (old?.date === p.date && old.timezone === s.timezone) return old;
      const candidates: {
        title: string;
        due: string;
        reason: string;
        priority?: string;
      }[] = [];
      const warnings = [
        "Google Calendar and email are not connected. Meetings, conflicts and calendar availability are unknown.",
      ];
      const sources = ["Saved real Nexus tasks"];
      try {
        if (s.industry === "Co-hosting") {
          const b = await loadBusiness();
          candidates.push(
            ...b.records
              .filter((r) => r.status !== "Complete" && r.dueDate)
              .map((r) => ({
                title: r.name,
                due: r.dueDate!,
                reason: "Saved Co-hosting " + r.kind,
              })),
          );
          sources.push("Saved Co-hosting records");
        } else {
          const o = await loadOperations();
          candidates.push(
            ...o.records
              .filter(
                (r) =>
                  (s.industry === "General" || r.venture === s.industry) &&
                  !["Complete", "Archived"].includes(r.status) &&
                  r.due,
              )
              .map((r) => ({
                title: r.title,
                due: r.due,
                priority: r.status === "Blocked" ? "High" : "Normal",
                reason: "Saved " + r.venture + " record",
              })),
          );
          sources.push("Saved venture records");
        }
      } catch {
        warnings.push(
          "Business records unavailable; priorities may be incomplete.",
        );
      }
      const b = composeBrief(s, [], now, candidates, warnings);
      // A missing integration must never produce an apparent calendar all-clear.
      const text = b.text
        .replace(
          "No calendar items found in the selected calendars.",
          "Calendar unavailable: Google is not connected.",
        )
        .replace(
          "No timed overlaps found in available selected-calendar data.",
          "Unknown: calendar connection required.",
        )
        .replace(
          "No title-matched admin intrusion found. Unclassified meetings still need review.",
          "Unknown: calendar connection required to flag interruptions.",
        )
        .replace(/: 0 calendar items/g, ": calendar unavailable");
      const result: MorningBrief = {
        version: 1,
        date: p.date,
        timezone: s.timezone,
        generatedAt: now.toISOString(),
        late: p.time > "05:01",
        text,
        sources,
      };
      const target = location(),
        temp = target + "." + randomBytes(8).toString("hex") + ".tmp";
      await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      try {
        await fs.writeFile(temp, JSON.stringify(result), {
          flag: "wx",
          mode: 0o600,
        });
        await fs.rename(temp, target);
      } finally {
        await fs.rm(temp, { force: true });
      }
      return result;
    });
  shared.nexusMorningQueue = work.catch(() => {});
  return work;
}
