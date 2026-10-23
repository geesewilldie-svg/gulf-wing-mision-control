import { ventures } from "./demo";
export const operatingVentures = [
  ventures[0],
  ventures[2],
  ventures[3],
  ventures[4],
] as const;
export type OperatingVenture = (typeof operatingVentures)[number];
export const recordStatuses = [
  "Planned",
  "In progress",
  "Blocked",
  "Complete",
  "Archived",
] as const;
export type OperatingRecord = {
  id: string;
  venture: OperatingVenture;
  title: string;
  category: string;
  owner: string;
  due: string;
  status: (typeof recordStatuses)[number];
  notes: string;
  checks: { label: string; done: boolean }[];
};
export type Operations = { revision: number; records: OperatingRecord[] };
export const ventureProfiles: Record<
  OperatingVenture,
  {
    code: string;
    title: string;
    description: string;
    categories: string[];
    checks: string[];
    source: string;
  }
> = {
  [ventures[0]]: {
    code: "GROUP / GOVERNANCE",
    title: "One group. Clear accountability.",
    description:
      "Coordinate entity decisions, shared resources, evidence and expansion gates across Gulf Wing.",
    categories: [
      "Governance decision",
      "Finance review",
      "Shared resource",
      "Entity readiness",
    ],
    checks: [
      "Entity and authority evidence reviewed",
      "Actual cash and obligations reconciled",
      "Owner capacity and responsible lead reviewed",
      "Decision and supporting evidence recorded",
    ],
    source:
      "Financial Methodology · model controls and investor data-room checklist",
  },
  Aviation: {
    code: "AVIATION / GROUND SERVICES",
    title: "Precision on the ground.",
    description:
      "Aircraft cleaning, cabin readiness and facility-service planning, with site-specific access and aircraft-care controls.",
    categories: [
      "Aircraft cleaning",
      "Cabin readiness",
      "Facility service",
      "Access / insurance review",
    ],
    checks: [
      "Written operator / FBO and work-area authorization reviewed",
      "Aviation liability and care / custody / control evidence reviewed",
      "Approved methods, chemicals and trained personnel confirmed",
      "FOD, aircraft proximity and wastewater controls reviewed",
      "Customer scope and acceptance recorded",
    ],
    source:
      "Aviation Business Plan · access, insurance and operating readiness",
  },
  "Security Operations": {
    code: "SECURITY / MISSION DESK",
    title: "Prepared. Accountable. Mission focused.",
    description:
      "Plan UAS documentation, protective-service assignments, equipment readiness and incident follow-up in one mission desk.",
    categories: [
      "UAS documentation",
      "Protective assignment",
      "Equipment readiness",
      "Incident follow-up",
    ],
    checks: [
      "Customer scope and assignment authority documented",
      "Applicable agency / personnel credentials reviewed",
      "UAS pilot, aircraft and airspace requirements reviewed if applicable",
      "Insurance, personnel and equipment readiness reviewed",
      "Deliverable, incident and customer handover recorded",
    ],
    source:
      "Security Operations Business Plan · core strategy and operating controls",
  },
  "Future Ventures": {
    code: "VENTURES / INCUBATION",
    title: "Explore deliberately. Expand with evidence.",
    description:
      "Keep new opportunities in discovery until demand, funding, capacity and approvals support a separate launch decision.",
    categories: [
      "Opportunity",
      "Market validation",
      "Feasibility",
      "Launch decision",
    ],
    checks: [
      "Demand evidence and defined service scope recorded",
      "Standalone downside case and funding reviewed",
      "Legal, site and insurance requirements reviewed",
      "Staffing and owner capacity reviewed",
      "Explicit launch decision recorded",
    ],
    source:
      "Financial Methodology and Security Business Plan · conditional expansion gates",
  },
};
const object = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
function str(x: unknown, max: number, required = false): string {
  if (typeof x !== "string" || x.length > max || (required && !x.trim()))
    throw new Error("Invalid operating record text.");
  return x.trim();
}
export function validOperations(value: unknown): Operations {
  if (
    !object(value) ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 0 ||
    !Array.isArray(value.records) ||
    value.records.length > 1000
  )
    throw new Error("Invalid operations backup or revision.");
  const ids = new Set<string>();
  const records = value.records.map((r): OperatingRecord => {
    if (
      !object(r) ||
      !operatingVentures.includes(r.venture as OperatingVenture) ||
      !recordStatuses.includes(r.status as OperatingRecord["status"])
    )
      throw new Error("Invalid venture or status.");
    const venture = r.venture as OperatingVenture;
    const id = str(r.id, 80, true);
    if (!/^[a-zA-Z0-9-]+$/.test(id) || ids.has(id))
      throw new Error("Invalid or duplicate record ID.");
    ids.add(id);
    const due = str(r.due, 10);
    if (
      due &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(due) ||
        !Number.isFinite(Date.parse(due)) ||
        new Date(due).toISOString().slice(0, 10) !== due)
    )
      throw new Error("Invalid due date.");
    if (
      !ventureProfiles[venture].categories.includes(r.category as string) ||
      !Array.isArray(r.checks) ||
      r.checks.length > 12
    )
      throw new Error("Invalid category or checklist.");
    return {
      id,
      venture,
      title: str(r.title, 120, true),
      category: r.category as string,
      owner: str(r.owner, 100),
      due,
      status: r.status as OperatingRecord["status"],
      notes: str(r.notes, 4000),
      checks: r.checks.map((c) => {
        if (!object(c) || typeof c.done !== "boolean")
          throw new Error("Invalid checklist.");
        return { label: str(c.label, 180, true), done: c.done };
      }),
    };
  });
  return { revision: value.revision as number, records };
}
