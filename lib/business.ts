export type ChecklistItem = { label: string; done: boolean };
export type BusinessRecord = {
  id: string;
  kind: "Lead" | "Property" | "Job";
  name: string;
  notes: string;
  status: "Planned" | "Active" | "Complete";
  contact?: string;
  email?: string;
  phone?: string;
  address?: string;
  serviceId?: string;
  parentId?: string;
  assignee?: string;
  dueDate?: string;
  checklist?: ChecklistItem[];
};
export type Service = {
  id: string;
  name: string;
  description: string;
  active: boolean;
};
export type Quote = {
  id: string;
  name: string;
  hours: number;
  wage: number;
  burden: number;
  materials: number;
  margin: number;
  recordId?: string;
  serviceId?: string;
  scope?: string;
  status?: "Draft" | "Sent" | "Accepted" | "Declined";
  jobId?: string;
};
export type BusinessState = {
  revision: number;
  records: BusinessRecord[];
  quotes: Quote[];
  services: Service[];
  marketing: { total: number; meta: number; google: number; linkedin: number };
  audit: string[];
};
export const starterServices: Service[] = [
  {
    id: "turnover",
    name: "Turnover cleaning",
    description:
      "Cleaning and documented property readiness within an agreed scope.",
    active: true,
  },
  {
    id: "deep-clean",
    name: "Deep / move-in or move-out clean",
    description:
      "Condition-based cleaning; quote unusual access, laundry or pet burdens separately.",
    active: true,
  },
  {
    id: "owner-support",
    name: "Owner support",
    description:
      "Restocking, nontechnical readiness checks and owner-approved vendor coordination.",
    active: true,
  },
  {
    id: "linen",
    name: "Laundry and linen coordination",
    description: "Agreed linen counts, handling and readiness documentation.",
    active: true,
  },
];
export const jobChecklist = (): ChecklistItem[] =>
  [
    "Confirm scope, schedule and owner-approved access",
    "Document initial condition with permission",
    "Complete agreed service and restocking",
    "Check quality and report damage or follow-up needs",
    "Confirm completion and owner acceptance",
  ].map((label) => ({ label, done: false }));
export const emptyBusiness = (): BusinessState => ({
  revision: 0,
  records: [],
  quotes: [],
  services: starterServices.map((s) => ({ ...s })),
  marketing: { total: 500, meta: 0, google: 0, linkedin: 0 },
  audit: [],
});
const requiredText = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;
const finite = (v: unknown, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max;
function optionalText(v: unknown, max: number): string {
  if (v === undefined) return "";
  if (typeof v !== "string" || v.length > max)
    throw Error("Invalid operating details.");
  return v.trim();
}
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
    throw Error("Invalid business data.");
  const ids = new Set<string>();
  const records = s.records.map((r) => {
    if (
      !r ||
      !requiredText(r.id, 80) ||
      ids.has(r.id) ||
      !requiredText(r.name, 160) ||
      typeof r.notes !== "string" ||
      r.notes.length > 2000 ||
      !["Lead", "Property", "Job"].includes(r.kind) ||
      !["Planned", "Active", "Complete"].includes(r.status)
    )
      throw Error("Invalid operating record.");
    ids.add(r.id);
    const dueDate = optionalText(r.dueDate, 10);
    if (
      dueDate &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) ||
        !Number.isFinite(Date.parse(dueDate)) ||
        new Date(dueDate).toISOString().slice(0, 10) !== dueDate)
    )
      throw Error("Use a valid scheduled date.");
    const email = optionalText(r.email, 240);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw Error("Use a valid contact email.");
    const checklist = r.checklist ?? [];
    if (
      !Array.isArray(checklist) ||
      checklist.length > 30 ||
      checklist.some(
        (c) => !c || !requiredText(c.label, 200) || typeof c.done !== "boolean",
      )
    )
      throw Error("Invalid job checklist.");
    return {
      id: r.id,
      kind: r.kind,
      status: r.status,
      name: r.name.trim(),
      notes: r.notes,
      contact: optionalText(r.contact, 160),
      email,
      phone: optionalText(r.phone, 60),
      address: optionalText(r.address, 400),
      assignee: optionalText(r.assignee, 160),
      dueDate,
      parentId: optionalText(r.parentId, 80),
      serviceId: optionalText(r.serviceId, 80),
      checklist: checklist.map((c) => ({ label: c.label, done: c.done })),
    };
  });
  const quotes = s.quotes.map((q) => {
    if (
      !q ||
      !requiredText(q.id, 80) ||
      ids.has(q.id) ||
      !requiredText(q.name, 160) ||
      !finite(q.hours, 10000) ||
      !finite(q.wage, 10000) ||
      !finite(q.burden, 100) ||
      !finite(q.materials, 1000000) ||
      !finite(q.margin, 95) ||
      (q.status !== undefined &&
        !["Draft", "Sent", "Accepted", "Declined"].includes(q.status))
    )
      throw Error("Invalid estimate.");
    ids.add(q.id);
    return {
      id: q.id,
      name: q.name.trim(),
      hours: q.hours,
      wage: q.wage,
      burden: q.burden,
      materials: q.materials,
      margin: q.margin,
      status: q.status ?? "Draft",
      recordId: optionalText(q.recordId, 80),
      serviceId: optionalText(q.serviceId, 80),
      scope: optionalText(q.scope, 2000),
      jobId: optionalText(q.jobId, 80),
    };
  });
  const services = s.services ?? starterServices;
  if (!Array.isArray(services) || services.length > 100)
    throw Error("Invalid service catalog.");
  const serviceIds = new Set<string>();
  const cleanServices = services.map((service) => {
    if (
      !service ||
      !requiredText(service.id, 80) ||
      serviceIds.has(service.id) ||
      !requiredText(service.name, 160) ||
      typeof service.description !== "string" ||
      service.description.length > 2000 ||
      typeof service.active !== "boolean"
    )
      throw Error("Invalid service.");
    serviceIds.add(service.id);
    return {
      id: service.id,
      name: service.name.trim(),
      description: service.description,
      active: service.active,
    };
  });
  for (const record of records) {
    if (record.serviceId && !serviceIds.has(record.serviceId))
      throw Error("Selected service no longer exists.");
    if (
      record.parentId &&
      (record.parentId === record.id ||
        !records.some((r) => r.id === record.parentId && r.kind !== "Job"))
    )
      throw Error("Choose an existing lead or property.");
  }
  for (const quote of quotes) {
    if (quote.serviceId && !serviceIds.has(quote.serviceId))
      throw Error("Selected service no longer exists.");
    if (quote.recordId && !records.some((r) => r.id === quote.recordId))
      throw Error("Choose an existing operating record.");
    if (
      quote.jobId &&
      !records.some((r) => r.id === quote.jobId && r.kind === "Job")
    )
      throw Error("Estimate job no longer exists.");
  }
  const { total, meta, google, linkedin } = s.marketing;
  if (
    ![total, meta, google, linkedin].every((v) => finite(v, 1000000)) ||
    meta + google + linkedin > total + 0.00001
  )
    throw Error(
      "Channel allocations must not exceed the proposed total budget.",
    );
  return {
    revision: s.revision,
    records,
    quotes,
    services: cleanServices,
    marketing: { total, meta, google, linkedin },
  };
}

export function businessId() {
  return typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
}
