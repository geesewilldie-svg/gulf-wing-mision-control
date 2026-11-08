export type Acceptance = {
  confirmed?: boolean;
  acceptedBy: string;
  method: "Email" | "Phone" | "Signed document" | "In person" | "Test";
  reference: string;
  recordedBy: string;
  recordedAt?: string;
  quoteVersion?: number;
  priceCents?: number;
  customerName?: string;
  address?: string;
  serviceName?: string;
  scope?: string;
  origin?: "operator" | "restored-unverified";
};
export type JobPhase =
  | "Scheduled"
  | "In progress"
  | "Review required"
  | "Rework"
  | "Accepted"
  | "Legacy unreviewed";
export type JobReview = {
  confirmed?: boolean;
  origin?: "operator" | "restored-unverified" | "legacy";
  phase: JobPhase;
  summary: string;
  reviewer: string;
  note: string;
  submittedAt?: string;
  reviewedAt?: string;
  submissionVersion: number;
  history: {
    decision: "Accepted" | "Rework";
    reviewer: string;
    note: string;
    at: string;
    submissionVersion: number;
    origin?: "operator" | "restored-unverified";
  }[];
};
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
  isTest?: boolean;
  leadSource?: string;
  sourceQuoteId?: string;
  sourceQuoteVersion?: number;
  review?: JobReview;
};
export type Service = {
  id: string;
  name: string;
  description: string;
  active: boolean;
};
export type Quote = {
  isTest?: boolean;
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
  version?: number;
  acceptance?: Acceptance;
};
export type BusinessState = {
  revision: number;
  workflowVersion?: 1;
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
    "Submit completion summary for owner review",
  ].map((label) => ({ label, done: false }));
export const emptyBusiness = (): BusinessState => ({
  revision: 0,
  workflowVersion: 1,
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
    (s.workflowVersion !== undefined && s.workflowVersion !== 1) ||
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
      isTest: r.isTest === true,
      leadSource: optionalText(r.leadSource, 200),
      sourceQuoteId: optionalText(r.sourceQuoteId, 80),
      sourceQuoteVersion:
        r.sourceQuoteVersion === undefined
          ? undefined
          : positiveVersion(r.sourceQuoteVersion),
      review: r.kind === "Job" ? cleanReview(r.review, r.status) : undefined,
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
      isTest:
        q.isTest === true ||
        records.find((r) => r.id === q.recordId)?.isTest === true,
      version: q.version === undefined ? 1 : positiveVersion(q.version),
      acceptance:
        q.acceptance === undefined ? undefined : cleanAcceptance(q.acceptance),
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
    workflowVersion: 1,
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

export function positiveVersion(v: unknown): number {
  if (!Number.isSafeInteger(v) || (v as number) < 1 || (v as number) > 1000000)
    throw Error("Invalid workflow version.");
  return v as number;
}
const phases: JobPhase[] = [
  "Scheduled",
  "In progress",
  "Review required",
  "Rework",
  "Accepted",
  "Legacy unreviewed",
];
function cleanReview(
  value: JobReview | undefined,
  status: BusinessRecord["status"],
): JobReview {
  if (value === undefined)
    return {
      phase:
        status === "Complete"
          ? "Legacy unreviewed"
          : status === "Active"
            ? "In progress"
            : "Scheduled",
      summary: "",
      reviewer: "",
      note: "",
      submittedAt: "",
      reviewedAt: "",
      confirmed: false,
      origin: status === "Complete" ? "legacy" : "operator",
      submissionVersion: 0,
      history: [],
    };
  if (
    !value ||
    !phases.includes(value.phase) ||
    !Number.isSafeInteger(value.submissionVersion) ||
    value.submissionVersion < 0 ||
    value.submissionVersion > 1000000 ||
    !Array.isArray(value.history) ||
    value.history.length > 20
  )
    throw Error("Invalid completion review.");
  const history = value.history.map((h) => {
    if (
      !h ||
      !["Accepted", "Rework"].includes(h.decision) ||
      !requiredText(h.reviewer, 160) ||
      !requiredText(h.note, 1000) ||
      !requiredText(h.at, 40) ||
      !Number.isSafeInteger(h.submissionVersion) ||
      h.submissionVersion < 0
    )
      throw Error("Invalid completion history.");
    return {
      decision: h.decision,
      reviewer: h.reviewer,
      note: h.note,
      at: h.at,
      submissionVersion: h.submissionVersion,
      origin:
        h.origin === "restored-unverified"
          ? ("restored-unverified" as const)
          : ("operator" as const),
    };
  });
  return {
    phase: value.phase,
    confirmed: value.confirmed === true,
    origin:
      value.origin === "restored-unverified"
        ? "restored-unverified"
        : value.phase === "Legacy unreviewed"
          ? "legacy"
          : "operator",
    summary: optionalText(value.summary, 2000),
    reviewer: optionalText(value.reviewer, 160),
    note: optionalText(value.note, 1000),
    submittedAt: optionalText(value.submittedAt, 40),
    reviewedAt: optionalText(value.reviewedAt, 40),
    submissionVersion: value.submissionVersion,
    history,
  };
}
function cleanAcceptance(a: Acceptance): Acceptance {
  if (
    !a ||
    !["Email", "Phone", "Signed document", "In person", "Test"].includes(
      a.method,
    )
  )
    throw Error("Choose an acceptance method.");
  const cents = a.priceCents;
  if (cents !== undefined && (!Number.isSafeInteger(cents) || cents < 0))
    throw Error("Invalid accepted estimate price.");
  return {
    confirmed: a.confirmed === true,
    acceptedBy: optionalText(a.acceptedBy, 160),
    method: a.method,
    reference: optionalText(a.reference, 500),
    recordedBy: optionalText(a.recordedBy, 160),
    recordedAt: optionalText(a.recordedAt, 40),
    quoteVersion:
      a.quoteVersion === undefined
        ? undefined
        : positiveVersion(a.quoteVersion),
    priceCents: cents,
    customerName: optionalText(a.customerName, 160),
    address: optionalText(a.address, 400),
    serviceName: optionalText(a.serviceName, 160),
    scope: optionalText(a.scope, 2000),
    origin: a.origin === "operator" ? "operator" : "restored-unverified",
  };
}
