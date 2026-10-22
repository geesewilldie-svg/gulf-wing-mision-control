import { loadBusiness } from "./business-store";
import { type KnowledgeDocument, estimateService } from "@/lib/nexus";
export async function businessKnowledge(): Promise<KnowledgeDocument[]> {
  const state = await loadBusiness();
  const source = "Saved Co-hosting operations";
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
  }).format(new Date());
  const tomorrow = new Date(Date.parse(today + "T12:00:00Z") + 86400000)
    .toISOString()
    .slice(0, 10);
  const openJobs = state.records.filter(
    (r) => r.kind === "Job" && r.status !== "Complete",
  );
  const scheduleSummary =
    "Open jobs due today: " +
    openJobs.filter((r) => r.dueDate === today).length +
    "; tomorrow: " +
    openJobs.filter((r) => r.dueDate === tomorrow).length +
    "; overdue: " +
    openJobs.filter((r) => r.dueDate && r.dueDate < today).length +
    ". ";
  const docs: KnowledgeDocument[] = [
    {
      id: "operations-summary",
      source,
      location: "Revision " + state.revision,
      text:
        "Saved operating snapshot as of " +
        today +
        " (America/New_York), not forecasts or proof of payment. " +
        state.records.filter((r) => r.kind === "Lead").length +
        " leads; " +
        state.records.filter((r) => r.kind === "Property").length +
        " properties; " +
        state.records.filter((r) => r.kind === "Job" && r.status !== "Complete")
          .length +
        " open jobs/tasks; " +
        state.quotes.filter((q) => q.status === "Accepted").length +
        " accepted estimates. " +
        scheduleSummary +
        "Customer acceptance and status are manually recorded by controllers.",
    },
  ];
  for (const r of state.records)
    docs.push({
      id: "record-" + r.id,
      source,
      location: r.kind + ": " + r.name,
      text: [
        r.kind + " " + r.name + " · Status " + r.status,
        r.kind === "Job"
          ? "Jobs / tasks / scheduled work"
          : r.kind === "Lead"
            ? "Leads / prospects / customer intake"
            : "Properties / service locations",
        r.dueDate === today
          ? "Scheduled today"
          : r.dueDate === tomorrow
            ? "Scheduled tomorrow"
            : r.dueDate && r.dueDate < today && r.status !== "Complete"
              ? "Overdue"
              : "",
        r.dueDate ? "Scheduled / due " + r.dueDate : "No scheduled date",
        r.assignee ? "Assigned to " + r.assignee : "",
        r.contact ? "Contact " + r.contact : "",
        r.address ? "Address " + r.address : "",
        r.notes,
        state.services.find((s) => s.id === r.serviceId)?.name,
        r.checklist
          ?.map((c) => (c.done ? "Done: " : "Pending: ") + c.label)
          .join("; "),
      ]
        .filter(Boolean)
        .join("\n"),
    });
  for (const q of state.quotes)
    docs.push({
      id: "estimate-" + q.id,
      source,
      location: "Estimate: " + q.name,
      text:
        "Estimates / quotes: " +
        q.name +
        " · " +
        (q.status || "Draft") +
        " · price before tax $" +
        estimateService(
          q.hours,
          q.wage,
          q.burden,
          q.materials,
          q.margin,
        ).price.toFixed(2) +
        " · customer/property " +
        (state.records.find((r) => r.id === q.recordId)?.name || "unlinked") +
        " · scope " +
        (q.scope || "not specified") +
        ". This is not an invoice, payment or proof of customer approval beyond the manually recorded status.",
    });
  for (const s of state.services)
    docs.push({
      id: "service-" + s.id,
      source,
      location: "Service catalog",
      text:
        "Services: " +
        s.name +
        " · " +
        (s.active ? "Active" : "Inactive") +
        " · " +
        s.description +
        ". Scope and pricing require owner review.",
    });
  return docs;
}
