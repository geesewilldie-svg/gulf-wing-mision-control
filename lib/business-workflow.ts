import {
  type BusinessState,
  type BusinessRecord,
  type Quote,
  type JobReview,
} from "./business";
import { estimateService } from "./nexus";
const stable = (v: unknown) =>
  JSON.stringify(v, (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
        )
      : value,
  );
const same = (a: unknown, b: unknown) => stable(a) === stable(b);
const quoteTerms = (q: Quote) => [
  q.name,
  q.hours,
  q.wage,
  q.burden,
  q.materials,
  q.margin,
  q.recordId || "",
  q.serviceId || "",
  q.scope || "",
];
const jobTerms = (r: BusinessRecord) => [
  r.name,
  r.notes,
  r.parentId || "",
  r.serviceId || "",
  r.address || "",
  r.contact || "",
  r.email || "",
  r.phone || "",
  r.isTest === true,
  r.sourceQuoteId || "",
  r.sourceQuoteVersion,
  r.assignee || "",
  r.dueDate || "",
  r.checklist || [],
];
export function acceptanceRecorded(q: Quote) {
  return (
    q.status === "Accepted" &&
    q.acceptance?.origin === "operator" &&
    q.acceptance.confirmed === true &&
    q.acceptance.quoteVersion === q.version
  );
}
export function reviewAccepted(r: BusinessRecord) {
  return (
    r.kind === "Job" &&
    r.review?.phase === "Accepted" &&
    r.review.origin === "operator" &&
    r.review.confirmed === true
  );
}
export function applyBusinessWorkflow(
  current: BusinessState,
  incoming: Omit<BusinessState, "audit">,
  now = new Date().toISOString(),
  restore = false,
): Omit<BusinessState, "audit"> {
  const next = structuredClone(incoming);
  if (restore) {
    for (const q of next.quotes) {
      if (q.acceptance) q.acceptance.origin = "restored-unverified";
    }
    for (const r of next.records) {
      if (r.kind === "Job")
        r.review = {
          ...r.review!,
          origin: "restored-unverified",
          confirmed: false,
          phase:
            r.status === "Complete"
              ? "Legacy unreviewed"
              : r.status === "Planned"
                ? "Scheduled"
                : "In progress",
          history: (r.review?.history || []).map((h) => ({
            ...h,
            origin: "restored-unverified",
          })),
        };
    }
    return next;
  }
  for (const r of next.records) {
    const old = current.records.find((x) => x.id === r.id);
    if (old && old.kind !== r.kind)
      throw Error("Create a related record instead of changing its type.");
    if (old && old.isTest !== r.isTest)
      throw Error("Test and live record identities cannot be changed.");
    const seen = new Set<string>([r.id]);
    let parent = r.parentId;
    while (parent) {
      if (seen.has(parent))
        throw Error("Operating record links cannot form a cycle.");
      seen.add(parent);
      parent = next.records.find((x) => x.id === parent)?.parentId;
    }
    if (r.parentId) {
      const p = next.records.find((x) => x.id === r.parentId)!;
      if (Boolean(p.isTest) !== Boolean(r.isTest))
        throw Error("Test and live records cannot be linked.");
    }
  }
  for (const q of next.quotes) {
    const old = current.quotes.find((x) => x.id === q.id);
    if (old && Boolean(old.isTest) !== Boolean(q.isTest))
      throw Error("Test and live estimate identities cannot be changed.");
    const linked = next.records.find((r) => r.id === q.recordId);
    if (linked && Boolean(linked.isTest) !== Boolean(q.isTest))
      throw Error("Test and live estimates cannot share customer records.");
    if (old && q.version !== old.version)
      throw Error("Estimate version changed. Reload before editing.");
    const version = old
      ? !same(quoteTerms(q), quoteTerms(old))
        ? (old.version || 1) + 1
        : old.version || 1
      : 1;
    if (
      old &&
      (old.jobId || acceptanceRecorded(old)) &&
      (!same(quoteTerms(q), quoteTerms(old)) ||
        q.status !== old.status ||
        !same(q.acceptance, old.acceptance))
    )
      throw Error(
        "Accepted estimates and job-linked estimates are locked. Create a new draft for changed scope.",
      );
    if (old?.jobId && q.jobId !== old.jobId)
      throw Error("An estimate's existing job cannot be replaced.");
    q.version = version;
    const record = next.records.find((r) => r.id === q.recordId);
    if (
      q.status === "Accepted" &&
      (!old ||
        old.status !== "Accepted" ||
        (!acceptanceRecorded(old) && !same(q.acceptance, old.acceptance)))
    ) {
      const a = q.acceptance;
      if (
        !a ||
        a.confirmed !== true ||
        !a.acceptedBy ||
        !a.recordedBy ||
        !a.reference
      )
        throw Error(
          "Record who accepted, how, a reference and who recorded the acceptance.",
        );
      if (!record || !record.address || !record.contact || !q.scope?.trim())
        throw Error(
          "Acceptance needs a linked contact, service address, and agreed scope.",
        );
      const service = next.services.find((s) => s.id === q.serviceId);
      if (!service?.active)
        throw Error("Select an active service before recording acceptance.");
      if ((a.method === "Test") !== Boolean(record.isTest))
        throw Error(
          "Use Test acceptance only for test records; use a real method for live records.",
        );
      const total = estimateService(
        q.hours,
        q.wage,
        q.burden,
        q.materials,
        q.margin,
      ).price;
      q.acceptance = {
        confirmed: true,
        acceptedBy: a.acceptedBy,
        method: a.method,
        reference: a.reference,
        recordedBy: a.recordedBy,
        recordedAt: now,
        quoteVersion: version,
        priceCents: Math.round(total * 100),
        customerName: record.contact || record.name,
        address: record.address,
        serviceName: service.name,
        scope: q.scope,
        origin: "operator",
      };
    } else if (q.status !== "Accepted") {
      if (q.acceptance)
        throw Error(
          "Only an accepted estimate may carry an acceptance receipt.",
        );
    } else if (!same(q.acceptance, old?.acceptance))
      throw Error("Acceptance history cannot be edited.");
    if (q.jobId && q.jobId !== old?.jobId) {
      if (!acceptanceRecorded(q))
        throw Error(
          "Record exact-version customer acceptance before creating a job.",
        );
      const job = next.records.find((r) => r.id === q.jobId);
      if (
        !job ||
        job.kind !== "Job" ||
        current.records.some((r) => r.id === job.id)
      )
        throw Error("Create one new job from the accepted estimate.");
      if (
        next.quotes.some((other) => other.id !== q.id && other.jobId === job.id)
      )
        throw Error("One job cannot represent multiple estimates.");
      if (
        !record ||
        Boolean(record.isTest) !== Boolean(job.isTest) ||
        job.serviceId !== q.serviceId ||
        job.notes !== q.scope ||
        job.address !== q.acceptance?.address ||
        job.contact !== q.acceptance?.customerName ||
        job.parentId !== (record.kind === "Job" ? "" : record.id)
      )
        throw Error(
          "The new job must preserve the accepted scope, customer and property.",
        );
      if (!job.dueDate || !job.assignee)
        throw Error("Choose the new job date and assignee before conversion.");
      job.sourceQuoteId = q.id;
      job.sourceQuoteVersion = q.version;
    }
  }
  for (const r of next.records.filter((r) => r.kind === "Job")) {
    const old = current.records.find((x) => x.id === r.id);
    const base = old?.review;
    if (r.sourceQuoteId) {
      const q = next.quotes.find((q) => q.id === r.sourceQuoteId);
      if (
        !q ||
        q.jobId !== r.id ||
        q.version !== r.sourceQuoteVersion ||
        (!acceptanceRecorded(q) &&
          (!old || q.acceptance?.origin !== "restored-unverified")) ||
        r.notes !== q.acceptance?.scope ||
        r.address !== q.acceptance?.address ||
        r.contact !== q.acceptance?.customerName ||
        r.serviceId !== q.serviceId
      )
        throw Error(
          "Preserve the accepted estimate's job scope and site; create a new estimate for changes.",
        );
    }
    let review = r.review!;
    if (
      old &&
      (r.sourceQuoteId !== old.sourceQuoteId ||
        r.sourceQuoteVersion !== old.sourceQuoteVersion)
    )
      throw Error("Job estimate provenance is immutable.");
    if (!old) {
      if (
        !["Scheduled", "In progress"].includes(review.phase) ||
        review.history.length ||
        review.submissionVersion
      )
        throw Error("New jobs start scheduled or in progress, not completed.");
      review = {
        ...review,
        origin: "operator",
        confirmed: false,
        summary: "",
        reviewer: "",
        note: "",
        history: [],
        submissionVersion: 0,
        submittedAt: "",
        reviewedAt: "",
      };
    } else {
      if (
        !same(review.history, base?.history) ||
        review.submissionVersion !== base?.submissionVersion ||
        review.submittedAt !== base?.submittedAt ||
        review.reviewedAt !== base?.reviewedAt
      )
        throw Error("Completion history and timestamps are server recorded.");
      if (
        ["Review required", "Accepted"].includes(base!.phase) &&
        !same(jobTerms(r), jobTerms(old))
      )
        throw Error(
          "Submitted or accepted work is locked. Request rework before changing it.",
        );
      if (review.phase !== base!.phase) {
        const allowed: Record<string, string[]> = {
          Scheduled: ["In progress"],
          "In progress": ["Review required"],
          "Review required": ["Accepted", "Rework"],
          Rework: ["In progress"],
          Accepted: ["Rework"],
          "Legacy unreviewed": ["In progress"],
        };
        if (!allowed[base!.phase]?.includes(review.phase))
          throw Error("Follow the job's start, submission and review steps.");
        if (review.phase === "Review required") {
          if (
            !r.checklist?.length ||
            r.checklist.some((c) => !c.done) ||
            review.summary.trim().length < 10
          )
            throw Error(
              "Complete every checklist item and provide a completion summary before review.",
            );
          if (!r.notes.trim() || !r.address || !r.contact || !r.serviceId)
            throw Error(
              "Confirm job scope, service, contact and address before review.",
            );
          review = {
            ...review,
            origin: "operator",
            confirmed: false,
            submittedAt: now,
            submissionVersion: base!.submissionVersion + 1,
            reviewer: "",
            note: "",
            reviewedAt: "",
          };
        }
        if (review.phase === "Accepted" || review.phase === "Rework") {
          if (
            review.confirmed !== true ||
            review.reviewer.trim().length < 2 ||
            review.note.trim().length < 10
          )
            throw Error(
              "Record the human reviewer and a specific decision note.",
            );
          if (
            review.phase === "Accepted" &&
            (!r.checklist?.length || r.checklist.some((c) => !c.done))
          )
            throw Error(
              "All checklist items must be complete before acceptance.",
            );
          review = {
            ...review,
            origin: "operator",
            confirmed: true,
            reviewedAt: now,
            history: [
              ...base!.history,
              {
                decision: review.phase,
                reviewer: review.reviewer,
                note: review.note,
                at: now,
                submissionVersion: base!.submissionVersion,
                origin: "operator" as const,
              },
            ].slice(-20),
          };
        }
        if (review.phase === "In progress")
          review = {
            ...review,
            origin: "operator",
            confirmed: false,
            summary: "",
            reviewer: "",
            note: "",
            submittedAt: "",
            reviewedAt: "",
          };
      } else if (
        ["Review required", "Accepted", "Rework", "Legacy unreviewed"].includes(
          review.phase,
        ) &&
        !same(review, base)
      )
        throw Error(
          "Use a new workflow transition instead of editing a recorded review.",
        );
    }
    const expected =
      review.phase === "Accepted" || review.phase === "Legacy unreviewed"
        ? "Complete"
        : review.phase === "Scheduled"
          ? "Planned"
          : "Active";
    if (r.status !== expected)
      throw Error("Use the job workflow to change completion status.");
    r.review = review;
  }
  for (const old of current.quotes) {
    if (
      (old.jobId || acceptanceRecorded(old)) &&
      !next.quotes.some((q) => q.id === old.id)
    )
      throw Error(
        "Keep accepted estimate history. Use backup/restore explicitly for recovery.",
      );
  }
  return next;
}
