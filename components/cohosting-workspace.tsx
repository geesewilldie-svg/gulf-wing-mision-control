"use client";
import { useEffect, useState } from "react";
import {
  type BusinessRecord,
  type BusinessState,
  type Quote,
  jobChecklist,
  businessId,
} from "@/lib/business";
import { estimateService } from "@/lib/nexus";
import ServiceCatalog from "./service-catalog";
import BusinessBackup from "./business-backup";

type Props = {
  state: BusinessState;
  save: (next: BusinessState) => Promise<boolean>;
  disabled: boolean;
  onDirty: (dirty: boolean) => void;
};
const blankRecord = (): BusinessRecord => ({
  id: businessId(),
  kind: "Lead",
  name: "",
  notes: "",
  status: "Planned",
  contact: "",
  email: "",
  phone: "",
  address: "",
  serviceId: "",
  parentId: "",
  assignee: "",
  dueDate: "",
  checklist: [],
});
const blankQuote = (): Quote => ({
  id: businessId(),
  name: "",
  hours: 2,
  wage: 22,
  burden: 18.65,
  materials: 20,
  margin: 30,
  status: "Draft",
  recordId: "",
  serviceId: "",
  scope: "",
});
const money = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    v,
  );
export default function CohostingWorkspace({
  state,
  save,
  disabled,
  onDirty,
}: Props) {
  const [record, setRecord] = useState(blankRecord);
  const [recordBaseline, setRecordBaseline] = useState("");
  const [quoteBaseline, setQuoteBaseline] = useState("");
  const [editing, setEditing] = useState(false);
  const [quote, setQuote] = useState(blankQuote);
  const [editingQuote, setEditingQuote] = useState(false);
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [jobDate, setJobDate] = useState("");
  const [jobOwner, setJobOwner] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const recordDirty =
      editing ||
      record.kind !== "Lead" ||
      record.status !== "Planned" ||
      Boolean(
        record.name ||
          record.notes ||
          record.contact ||
          record.email ||
          record.phone ||
          record.address ||
          record.serviceId ||
          record.parentId ||
          record.assignee ||
          record.dueDate,
      );
    const quoteDirty =
      editingQuote ||
      Boolean(quote.name || quote.scope || quote.recordId || quote.serviceId) ||
      quote.hours !== 2 ||
      quote.wage !== 22 ||
      quote.burden !== 18.65 ||
      quote.materials !== 20 ||
      quote.margin !== 30;
    onDirty(recordDirty || quoteDirty);
  }, [record, quote, editing, editingQuote, state.revision, onDirty]);
  const changed = (next: BusinessRecord) => {
    setRecord(next);
    onDirty(true);
  };
  const changeQuote = (next: Quote) => {
    setQuote(next);
    onDirty(true);
  };
  const today = new Date().toLocaleDateString("en-CA");
  const estimate = estimateService(
    quote.hours,
    quote.wage,
    quote.burden,
    quote.materials,
    quote.margin,
  );
  const jobs = state.records.filter(
    (r) => r.kind === "Job" && r.status !== "Complete",
  );
  const activeServices = state.services.filter((s) => s.active);
  const serviceOptions = (
    <>
      <option value="">Choose a service (optional)</option>
      {state.services.map((s) => (
        <option key={s.id} value={s.id} disabled={!s.active}>
          {s.name}
          {s.active ? "" : " · inactive"}
        </option>
      ))}
    </>
  );
  const recordOptions = (
    <>
      <option value="">Unlinked</option>
      {state.records.map((r) => (
        <option key={r.id} value={r.id}>
          {r.kind}: {r.name}
        </option>
      ))}
    </>
  );
  const resetRecord = () => {
    setRecord(blankRecord());
    setEditing(false);
  };
  const resetQuote = () => {
    setQuote(blankQuote());
    setEditingQuote(false);
  };
  const convert = async (q: Quote) => {
    if (q.jobId) return;
    const parent = state.records.find((r) => r.id === q.recordId);
    const job: BusinessRecord = {
      id: businessId(),
      kind: "Job",
      name: q.name,
      notes: q.scope || "",
      status: "Planned",
      parentId: parent && parent.kind !== "Job" ? parent.id : "",
      serviceId: q.serviceId,
      contact: parent?.contact,
      email: parent?.email,
      phone: parent?.phone,
      address: parent?.address,
      assignee: jobOwner,
      dueDate: jobDate,
      checklist: jobChecklist(),
    };
    if (
      await save({
        ...state,
        records: [...state.records, job],
        quotes: state.quotes.map((item) =>
          item.id === q.id ? { ...item, jobId: job.id } : item,
        ),
      })
    )
      setNotice(
        "Accepted estimate converted to one scheduled job. No invoice or message was sent.",
      );
  };
  return (
    <>
      <p>
        Private operating records · no sample clients are added. Service scope,
        tax, staffing, customer terms and final pricing need your review. No
        account sends messages or charges customers.
      </p>
      <div className="business-metrics" aria-label="Operations summary">
        <div>
          <strong>
            {
              state.records.filter(
                (r) => r.kind === "Lead" && r.status !== "Complete",
              ).length
            }
          </strong>
          <span>Open leads</span>
        </div>
        <div>
          <strong>
            {state.records.filter((r) => r.kind === "Property").length}
          </strong>
          <span>Properties</span>
        </div>
        <div>
          <strong>{jobs.filter((r) => r.dueDate === today).length}</strong>
          <span>Jobs today</span>
        </div>
        <div>
          <strong>
            {jobs.filter((r) => r.dueDate && r.dueDate < today).length}
          </strong>
          <span>Overdue jobs</span>
        </div>
        <div>
          <strong>
            {state.quotes.filter((q) => q.status === "Accepted").length}
          </strong>
          <span>Accepted estimates</span>
        </div>
      </div>
      <nav className="business-toolbar" aria-label="Co-hosting workflow">
        <a href="#cohosting-intake">Client intake</a>
        <a href="#cohosting-records">Work list</a>
        <a href="#cohosting-estimates">Estimates</a>
      </nav>
      <ServiceCatalog state={state} save={save} disabled={disabled} />
      <h3 id="cohosting-intake">
        {editing ? "Edit operating record" : "Client intake and scheduling"}
      </h3>
      <p>
        Use leads for prospective owners, properties for service locations and
        jobs for dated work. Initial service scope covers cleaning, readiness
        and agreed owner support; it does not authorize rental brokerage or
        regulated trades.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            editing &&
            JSON.stringify(state.records.find((r) => r.id === record.id)) !==
              recordBaseline
          ) {
            setNotice(
              "This record changed. Cancel the edit and reopen the latest version before saving.",
            );
            return;
          }
          const next = {
            ...record,
            name: record.name.trim(),
            checklist:
              record.kind === "Job"
                ? record.checklist?.length
                  ? record.checklist
                  : jobChecklist()
                : [],
          };
          if (
            await save({
              ...state,
              records: editing
                ? state.records.map((r) => (r.id === record.id ? next : r))
                : [...state.records, next],
            })
          )
            resetRecord();
        }}
      >
        <fieldset disabled={disabled}>
          <div className="nexus-fields">
            <label>
              Record type
              <select
                aria-label="Record type"
                value={record.kind}
                onChange={(e) =>
                  changed({
                    ...record,
                    kind: e.target.value as BusinessRecord["kind"],
                  })
                }
              >
                {["Lead", "Property", "Job"].map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
            <label>
              Name
              <input
                required
                maxLength={160}
                value={record.name}
                onChange={(e) => changed({ ...record, name: e.target.value })}
              />
            </label>
            <label>
              Contact name
              <input
                maxLength={160}
                value={record.contact || ""}
                onChange={(e) =>
                  changed({ ...record, contact: e.target.value })
                }
              />
            </label>
            <label>
              Contact email
              <input
                type="email"
                maxLength={240}
                value={record.email || ""}
                onChange={(e) => changed({ ...record, email: e.target.value })}
              />
            </label>
            <label>
              Contact phone
              <input
                type="tel"
                maxLength={60}
                value={record.phone || ""}
                onChange={(e) => changed({ ...record, phone: e.target.value })}
              />
            </label>
            <label>
              Property / service address
              <input
                maxLength={400}
                value={record.address || ""}
                onChange={(e) =>
                  changed({ ...record, address: e.target.value })
                }
              />
            </label>
            <label>
              Service
              <select
                aria-label="Service"
                value={record.serviceId || ""}
                onChange={(e) =>
                  changed({ ...record, serviceId: e.target.value })
                }
              >
                {serviceOptions}
              </select>
            </label>
            <label>
              Assigned to
              <input
                maxLength={160}
                value={record.assignee || ""}
                onChange={(e) =>
                  changed({ ...record, assignee: e.target.value })
                }
                placeholder="You, your wife, or a team member"
              />
            </label>
            <label>
              Scheduled / follow-up date
              <input
                type="date"
                value={record.dueDate || ""}
                onChange={(e) =>
                  changed({ ...record, dueDate: e.target.value })
                }
              />
            </label>
            <label>
              Record status
              <select
                aria-label="Record status"
                value={record.status}
                onChange={(e) =>
                  changed({
                    ...record,
                    status: e.target.value as BusinessRecord["status"],
                  })
                }
              >
                {["Planned", "Active", "Complete"].map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
            <label>
              Related lead / property
              <select
                aria-label="Related lead / property"
                value={record.parentId || ""}
                onChange={(e) =>
                  changed({ ...record, parentId: e.target.value })
                }
              >
                <option value="">Unlinked</option>
                {state.records
                  .filter((r) => r.kind !== "Job" && r.id !== record.id)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.kind}: {r.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <label>
            Notes (do not store passwords or access codes)
            <textarea
              maxLength={2000}
              value={record.notes}
              onChange={(e) => changed({ ...record, notes: e.target.value })}
            />
          </label>
          <div className="nexus-buttons">
            <button>
              {editing ? "Save operating record" : "Add operating record"}
            </button>
            {editing && (
              <button type="button" onClick={resetRecord}>
                Cancel record edit
              </button>
            )}
          </div>
        </fieldset>
      </form>
      <h3 id="cohosting-records">Operating records</h3>
      <div className="nexus-fields">
        <label>
          Find records
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, contact, location or assignee"
          />
        </label>
        <label>
          Show records
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            {["All", "Lead", "Property", "Job", "Due today", "Overdue"].map(
              (k) => (
                <option key={k}>{k}</option>
              ),
            )}
          </select>
        </label>
      </div>
      {!state.records.length && (
        <p>No operating records yet. Add your first lead or property above.</p>
      )}
      <ul className="nexus-records">
        {state.records
          .filter(
            (r) =>
              (filter === "All" ||
                r.kind === filter ||
                (filter === "Due today" &&
                  r.dueDate === today &&
                  r.status !== "Complete") ||
                (filter === "Overdue" &&
                  r.dueDate &&
                  r.dueDate < today &&
                  r.status !== "Complete")) &&
              [r.name, r.contact, r.address, r.assignee, r.email, r.notes]
                .join(" ")
                .toLowerCase()
                .includes(search.toLowerCase()),
          )
          .sort((a, b) =>
            (a.dueDate || "9999").localeCompare(b.dueDate || "9999"),
          )
          .map((r) => (
            <li key={r.id}>
              <strong>
                {r.kind}: {r.name}
              </strong>
              <p>
                {[r.contact, r.email, r.phone, r.address]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p>{r.notes}</p>
              <p>
                {state.services.find((s) => s.id === r.serviceId)?.name}{" "}
                {r.dueDate && <> · Scheduled {r.dueDate}</>}
                {r.assignee && <> · Assigned to {r.assignee}</>}
              </p>
              {r.parentId && (
                <p>
                  Related to:{" "}
                  {state.records.find((item) => item.id === r.parentId)?.name}
                </p>
              )}
              <div className="nexus-buttons">
                <button
                  disabled={disabled}
                  onClick={() =>
                    void save({
                      ...state,
                      records: state.records.map((item) =>
                        item.id === r.id
                          ? {
                              ...item,
                              status:
                                r.status === "Planned"
                                  ? "Active"
                                  : r.status === "Active"
                                    ? "Complete"
                                    : "Planned",
                            }
                          : item,
                      ),
                    })
                  }
                >
                  {r.status} · Advance
                </button>
                <button
                  disabled={disabled}
                  onClick={() => {
                    setRecord({ ...r });
                    setRecordBaseline(JSON.stringify(r));
                    setEditing(true);
                    onDirty(true);
                  }}
                >
                  Edit {r.name}
                </button>
                {r.kind === "Lead" && (
                  <button
                    disabled={disabled}
                    onClick={() => {
                      setRecord({
                        ...r,
                        id: businessId(),
                        kind: "Property",
                        name: r.name + " property",
                        parentId: r.id,
                        status: "Planned",
                      });
                      setEditing(false);
                      onDirty(true);
                    }}
                  >
                    Prepare property from lead
                  </button>
                )}
              </div>
              {r.kind === "Job" && r.checklist?.length ? (
                <fieldset disabled={disabled}>
                  <legend>Job checklist · {r.name}</legend>
                  {r.checklist.map((c, i) => (
                    <label className="business-check" key={i}>
                      <input
                        type="checkbox"
                        checked={c.done}
                        onChange={() =>
                          void save({
                            ...state,
                            records: state.records.map((item) =>
                              item.id === r.id
                                ? {
                                    ...item,
                                    checklist: item.checklist?.map(
                                      (entry, j) =>
                                        j === i
                                          ? { ...entry, done: !entry.done }
                                          : entry,
                                    ),
                                  }
                                : item,
                            ),
                          })
                        }
                      />
                      {c.label}
                    </label>
                  ))}
                </fieldset>
              ) : null}
            </li>
          ))}
      </ul>
      <h3 id="cohosting-estimates">
        {editingQuote ? "Edit service estimate" : "Draft service estimate"}
      </h3>
      <p>
        Planning calculator only. Default labor assumptions are editable. Tax,
        travel, overhead, scope and final pricing need review; no customer quote
        is sent. Mark “Sent” only after sharing it yourself.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            editingQuote &&
            JSON.stringify(state.quotes.find((q) => q.id === quote.id)) !==
              quoteBaseline
          ) {
            setNotice(
              "This estimate changed. Cancel the edit and reopen the latest version before saving.",
            );
            return;
          }
          if (
            await save({
              ...state,
              quotes: editingQuote
                ? state.quotes.map((q) => (q.id === quote.id ? quote : q))
                : [...state.quotes, quote],
            })
          )
            resetQuote();
        }}
      >
        <fieldset disabled={disabled}>
          <label>
            Estimate name
            <input
              required
              maxLength={160}
              value={quote.name}
              onChange={(e) => changeQuote({ ...quote, name: e.target.value })}
            />
          </label>
          <div className="nexus-fields">
            <label>
              Estimate customer / property
              <select
                aria-label="Estimate customer / property"
                value={quote.recordId || ""}
                onChange={(e) =>
                  changeQuote({ ...quote, recordId: e.target.value })
                }
              >
                {recordOptions}
              </select>
            </label>
            <label>
              Estimate service
              <select
                aria-label="Estimate service"
                value={quote.serviceId || ""}
                onChange={(e) =>
                  changeQuote({ ...quote, serviceId: e.target.value })
                }
              >
                {serviceOptions}
              </select>
            </label>
            {(["hours", "wage", "burden", "materials", "margin"] as const).map(
              (key) => (
                <label key={key}>
                  {
                    {
                      hours: "Labor hours",
                      wage: "Hourly wage ($)",
                      burden: "Employer burden (%)",
                      materials: "Other direct costs ($)",
                      margin: "Target gross margin (%)",
                    }[key]
                  }
                  <input
                    required
                    type="number"
                    min="0"
                    max={
                      key === "margin"
                        ? 95
                        : key === "burden"
                          ? 100
                          : key === "materials"
                            ? 1000000
                            : 10000
                    }
                    step="0.01"
                    value={quote[key]}
                    onChange={(e) =>
                      changeQuote({ ...quote, [key]: Number(e.target.value) })
                    }
                  />
                </label>
              ),
            )}
          </div>
          <label>
            Estimate scope and exclusions
            <textarea
              maxLength={2000}
              value={quote.scope || ""}
              onChange={(e) => changeQuote({ ...quote, scope: e.target.value })}
            />
          </label>
          <p>
            Direct cost: {money(estimate.cost)} · Draft price before tax:{" "}
            {money(estimate.price)}
          </p>
          <div className="nexus-buttons">
            <button>
              {editingQuote ? "Save estimate changes" : "Save draft estimate"}
            </button>
            {editingQuote && (
              <button type="button" onClick={resetQuote}>
                Cancel estimate edit
              </button>
            )}
          </div>
        </fieldset>
      </form>
      <p>
        {activeServices.length} active services · {state.quotes.length} saved
        estimates
      </p>
      <div className="nexus-fields">
        <label>
          New job date
          <input
            disabled={disabled}
            type="date"
            value={jobDate}
            onChange={(e) => setJobDate(e.target.value)}
          />
        </label>
        <label>
          New job assignee
          <input
            disabled={disabled}
            maxLength={160}
            value={jobOwner}
            onChange={(e) => setJobOwner(e.target.value)}
          />
        </label>
      </div>
      <ul className="nexus-records">
        {state.quotes.map((q) => (
          <li key={q.id}>
            <span>
              {q.name} ·{" "}
              {money(
                estimateService(
                  q.hours,
                  q.wage,
                  q.burden,
                  q.materials,
                  q.margin,
                ).price,
              )}{" "}
              before tax · {(q.status || "Draft").toUpperCase()}
            </span>
            {q.scope && <p>{q.scope}</p>}
            <p>{state.records.find((r) => r.id === q.recordId)?.name}</p>
            <label>
              Estimate status · {q.name}
              <select
                disabled={disabled || Boolean(q.jobId)}
                aria-label={"Estimate status · " + q.name}
                value={q.status || "Draft"}
                onChange={(e) =>
                  void save({
                    ...state,
                    quotes: state.quotes.map((item) =>
                      item.id === q.id
                        ? { ...item, status: e.target.value as Quote["status"] }
                        : item,
                    ),
                  })
                }
              >
                {["Draft", "Sent", "Accepted", "Declined"].map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
            <div className="nexus-buttons">
              <button
                disabled={disabled || Boolean(q.jobId)}
                onClick={() => {
                  setQuote({ ...q });
                  setQuoteBaseline(JSON.stringify(q));
                  setEditingQuote(true);
                  onDirty(true);
                }}
              >
                Edit estimate · {q.name}
              </button>
              <button
                disabled={disabled}
                onClick={() =>
                  window.open(
                    "/estimate/" + encodeURIComponent(q.id),
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
              >
                Print estimate · {q.name}
              </button>
              {q.status === "Accepted" && (
                <button
                  aria-label={
                    (q.jobId ? "Job already created · " : "Create job · ") +
                    q.name
                  }
                  disabled={disabled || Boolean(q.jobId)}
                  onClick={() => void convert(q)}
                >
                  {q.jobId ? "Job already created" : "Create job · " + q.name}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p role="status">{notice}</p>
      <BusinessBackup state={state} save={save} disabled={disabled} />
    </>
  );
}
