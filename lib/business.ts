export type BusinessRecord = {
  id: string;
  kind: "Lead" | "Property" | "Job";
  name: string;
  notes: string;
  status: "Planned" | "Active" | "Complete";
};
export type Quote = {
  id: string;
  name: string;
  hours: number;
  wage: number;
  burden: number;
  materials: number;
  margin: number;
};
export type BusinessState = {
  revision: number;
  records: BusinessRecord[];
  quotes: Quote[];
  marketing: { total: number; meta: number; google: number; linkedin: number };
  audit: string[];
};
export const emptyBusiness = (): BusinessState => ({
  revision: 0,
  records: [],
  quotes: [],
  marketing: { total: 500, meta: 0, google: 0, linkedin: 0 },
  audit: [],
});
export function validBusiness(value: unknown): Omit<BusinessState, "audit"> {
  const s = value as BusinessState;
  if (
    !s ||
    !Number.isSafeInteger(s.revision) ||
    s.revision < 0 ||
    !Array.isArray(s.records) ||
    s.records.length > 500 ||
    !Array.isArray(s.quotes) ||
    s.quotes.length > 500 ||
    !s.marketing
  )
    throw new Error("Invalid business data.");
  const text = (v: unknown, max: number) =>
    typeof v === "string" && v.trim().length > 0 && v.length <= max;
  const number = (v: unknown, max: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max;
  const ids = new Set<string>();
  const records = s.records.map((r) => {
    if (
      !r ||
      !text(r.id, 80) ||
      ids.has(r.id) ||
      !text(r.name, 160) ||
      typeof r.notes !== "string" ||
      r.notes.length > 2000 ||
      !["Lead", "Property", "Job"].includes(r.kind) ||
      !["Planned", "Active", "Complete"].includes(r.status)
    )
      throw new Error("Invalid operating record.");
    ids.add(r.id);
    return {
      id: r.id,
      kind: r.kind,
      name: r.name,
      notes: r.notes,
      status: r.status,
    };
  });
  const quotes = s.quotes.map((q) => {
    if (
      !q ||
      !text(q.id, 80) ||
      ids.has(q.id) ||
      !text(q.name, 160) ||
      !number(q.hours, 10000) ||
      !number(q.wage, 10000) ||
      !number(q.burden, 100) ||
      !number(q.materials, 1000000) ||
      !number(q.margin, 95)
    )
      throw new Error("Invalid estimate.");
    ids.add(q.id);
    return {
      id: q.id,
      name: q.name,
      hours: q.hours,
      wage: q.wage,
      burden: q.burden,
      materials: q.materials,
      margin: q.margin,
    };
  });
  const { total, meta, google, linkedin } = s.marketing;
  if (
    ![total, meta, google, linkedin].every((v) => number(v, 1000000)) ||
    meta + google + linkedin > total + 0.00001
  )
    throw new Error(
      "Channel allocations must not exceed the proposed total budget.",
    );
  return {
    revision: s.revision,
    records,
    quotes,
    marketing: { total, meta, google, linkedin },
  };
}
