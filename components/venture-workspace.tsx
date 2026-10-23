"use client";
import { useEffect, useRef, useState } from "react";
import {
  Download,
  Plus,
  RefreshCw,
  ShieldCheck,
  Plane,
  Radar,
  Building2,
  Compass,
} from "lucide-react";
import {
  operatingVentures,
  ventureProfiles,
  recordStatuses,
  validOperations,
  type Operations,
  type OperatingRecord,
  type OperatingVenture,
} from "@/lib/venture-operations";

function AircraftBlueprint() {
  return (
    <svg
      className="aircraft-blueprint"
      viewBox="0 0 720 300"
      role="img"
      aria-label="Original holographic aircraft schematic, decorative ground-service illustration"
    >
      <defs>
        <pattern
          id="aircraft-grid"
          width="30"
          height="30"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M30 0H0V30"
            fill="none"
            stroke="currentColor"
            strokeWidth=".4"
          />
        </pattern>
      </defs>
      <path fill="url(#aircraft-grid)" d="M0 0H720V300H0z" />
      <g fill="none" stroke="currentColor" strokeWidth="1.2">
        <ellipse
          cx="358"
          cy="150"
          rx="230"
          ry="125"
          strokeDasharray="4 9"
          opacity=".4"
        />
        <path
          d="M85 156Q82 143 112 140L316 129 445 36 485 36 398 131 566 141 618 105 636 107 604 151 636 195 618 197 566 162 398 171 485 267 445 267 316 174 112 164Z"
          fill="currentColor"
          fillOpacity=".035"
        />
        <path
          d="M86 153H604M316 129L316 174M398 131L398 171M445 36L398 151 445 267M150 138L150 166M197 135V170M242 132V172M566 141V162"
          opacity=".65"
        />
        <path d="M315 125V80H220M398 175V225H280M520 139V85H595" />
        <circle cx="315" cy="125" r="5" />
        <circle cx="398" cy="175" r="5" />
        <circle cx="520" cy="139" r="5" />
        <path d="M40 36V20H120M600 20H680V36M40 265V280H120M600 280H680V265" />
      </g>
      <g fill="currentColor" fontSize="10" fontFamily="monospace">
        <text x="220" y="73">
          CABIN / CLEANING
        </text>
        <text x="230" y="240">
          GROUND / READINESS
        </text>
        <text x="530" y="76">
          CARE / CONTROL
        </text>
        <text x="45" y="294">
          GW—A01 / CONCEPT SCHEMATIC · NOT TECHNICAL DATA
        </text>
      </g>
    </svg>
  );
}
const newRecord = (venture: OperatingVenture): OperatingRecord => ({
  id: crypto.randomUUID(),
  venture,
  title: "",
  category: ventureProfiles[venture].categories[0],
  owner: "",
  due: "",
  status: "Planned",
  notes: "",
  checks: ventureProfiles[venture].checks.map((label) => ({
    label,
    done: false,
  })),
});
export default function VentureWorkspace({
  venture,
  enabled,
  onSelect,
}: {
  venture: string;
  enabled: boolean;
  onSelect: (v: string) => void;
}) {
  const [data, setData] = useState<Operations | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<OperatingRecord | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Open");
  const [restore, setRestore] = useState<Operations | null>(null);
  const requestId = useRef(0);
  const allowed = operatingVentures.includes(venture as OperatingVenture);
  const current = venture as OperatingVenture;
  const profile = allowed ? ventureProfiles[current] : null;
  useEffect(() => {
    setQuery("");
    setFilter("Open");
    setRestore(null);
  }, [venture]);
  useEffect(() => {
    if (!enabled) {
      requestId.current++;
      setData(null);
      setDraft(null);
      setRestore(null);
      setMessage("");
      setBusy(false);
    }
  }, [enabled]);
  useEffect(() => {
    if (!draft) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft]);
  async function load() {
    const id = ++requestId.current;
    setBusy(true);
    try {
      const r = await fetch("/api/sync/ventures");
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Unable to load records.");
      const clean = validOperations(body);
      if (id === requestId.current) {
        setData(clean);
        setDraft(null);
        setRestore(null);
        setMessage("Loaded saved venture records from your laptop.");
      }
    } catch (e) {
      if (id === requestId.current) setMessage((e as Error).message);
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  }
  async function save(next: Operations) {
    const id = ++requestId.current;
    setBusy(true);
    try {
      const r = await fetch("/api/sync/ventures", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Unable to save records.");
      const clean = validOperations(body);
      if (id === requestId.current) {
        setData(clean);
        setDraft(null);
        setRestore(null);
        setMessage(
          "Saved to your laptop. Other controllers can load these records.",
        );
      }
    } catch (e) {
      if (id === requestId.current) setMessage((e as Error).message);
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  }
  function backup() {
    if (!data) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "gulf-wing-ventures-private.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function readBackup(file?: File) {
    if (!file) return;
    try {
      if (file.size > 2_000_000)
        throw new Error("Backup must be at most 2 MB.");
      setRestore(validOperations(JSON.parse(await file.text())));
      setMessage(
        "Backup validated. Confirm replacement below; no records have changed yet.",
      );
    } catch (e) {
      setRestore(null);
      setMessage((e as Error).message);
    }
  }
  if (!profile)
    return (
      <section className="venture-workspace cohosting-shortcut">
        <div className="eyebrow">CO-HOSTING / OPERATING DESK</div>
        <h2>From intake to handover.</h2>
        <p>
          Your saved customers, properties, service catalog, estimates and job
          checklists are in the Co-hosting workspace.
        </p>
        <a className="primary-button" href="/nexus?section=cohosting">
          Open Co-hosting operations →
        </a>
      </section>
    );
  const records = data?.records.filter((r) => r.venture === current) ?? [];
  const visible = records.filter(
    (r) =>
      (filter === "All" ||
        (filter === "Open"
          ? !["Complete", "Archived"].includes(r.status)
          : r.status === filter)) &&
      [r.title, r.owner, r.notes, r.category]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const open = records.filter(
    (r) => !["Complete", "Archived"].includes(r.status),
  );
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
  }).format(new Date());
  const icon =
    current === "Aviation" ? (
      <Plane aria-hidden="true" />
    ) : current === "Security Operations" ? (
      <Radar aria-hidden="true" />
    ) : current === "Future Ventures" ? (
      <Compass aria-hidden="true" />
    ) : (
      <Building2 aria-hidden="true" />
    );
  return (
    <section
      className={`venture-workspace venture-${current === "Aviation" ? "aviation" : current === "Security Operations" ? "security" : current === "Future Ventures" ? "future" : "holding"}`}
      aria-label={`${venture} operating workspace`}
    >
      <div className="venture-hero">
        <div className="venture-intro">
          <div className="eyebrow">
            {icon}
            {profile.code}
          </div>
          <h2>{profile.title}</h2>
          <p>{profile.description}</p>
          <span className="venture-mode">
            PRIVATE OPERATING RECORDS · MANUAL CONTROL
          </span>
        </div>
        {current === "Aviation" ? (
          <AircraftBlueprint />
        ) : current === "Security Operations" ? (
          <div className="mission-radar" aria-hidden="true">
            <span />
            <i />
            <b>GW / OPS</b>
          </div>
        ) : (
          <div className="venture-emblem" aria-hidden="true">
            {icon}
            <span>
              {current === "Future Ventures"
                ? "DISCOVER / VALIDATE / DECIDE"
                : "OVERSIGHT / EVIDENCE / EXECUTION"}
            </span>
          </div>
        )}
      </div>
      <div className="venture-toolbar">
        <button
          disabled={!enabled || busy}
          onClick={() => {
            if (
              !draft ||
              window.confirm("Discard unsaved record edits and reload?")
            )
              void load();
          }}
        >
          <RefreshCw size={15} aria-hidden="true" />
          Load venture records
        </button>
        <button
          disabled={!enabled || busy || !data}
          onClick={() => {
            if (!draft || window.confirm("Discard unsaved record edits?"))
              setDraft(newRecord(current));
          }}
        >
          <Plus size={15} aria-hidden="true" />
          New operating record
        </button>
        <button disabled={!enabled || !data || busy} onClick={backup}>
          <Download size={15} aria-hidden="true" />
          Export private backup
        </button>
      </div>
      {!enabled && (
        <p className="venture-callout">
          Connect this browser as a Controller through Connect devices to load
          and save private operating records.
        </p>
      )}
      <p className="venture-message" aria-live="polite">
        {message}
      </p>
      {!data && (
        <p>
          No operating records loaded. Use Load venture records. These records
          are separate from the DEMO missions and simulated agents below.
        </p>
      )}
      {data && (
        <>
          <div className="venture-stats">
            <div>
              <small>OPEN RECORDS</small>
              <strong>{open.length}</strong>
            </div>
            <div>
              <small>BLOCKED</small>
              <strong>
                {open.filter((r) => r.status === "Blocked").length}
              </strong>
            </div>
            <div>
              <small>OVERDUE / EASTERN</small>
              <strong>
                {open.filter((r) => r.due && r.due < today).length}
              </strong>
            </div>
            <div>
              <small>REVIEW ITEMS PENDING</small>
              <strong>
                {open.reduce(
                  (n, r) => n + r.checks.filter((c) => !c.done).length,
                  0,
                )}
              </strong>
            </div>
          </div>
          {current === operatingVentures[0] && (
            <div
              className="portfolio-grid"
              aria-label="Group portfolio overview"
            >
              {operatingVentures.slice(1).map((v) => (
                <button key={v} onClick={() => onSelect(v)}>
                  <span>{v}</span>
                  <strong>
                    {
                      data.records.filter(
                        (r) =>
                          r.venture === v &&
                          !["Complete", "Archived"].includes(r.status),
                      ).length
                    }{" "}
                    open records
                  </strong>
                  <small>Open operating desk →</small>
                </button>
              ))}
              <a href="/nexus?section=cohosting">
                <span>Co-hosting</span>
                <strong>Customer operations</strong>
                <small>Intake, estimates and jobs →</small>
              </a>
            </div>
          )}
          <div className="venture-controls">
            <label>
              Search operating records
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Title, owner, category or notes"
              />
            </label>
            <label>
              Record status
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                {["Open", "All", ...recordStatuses].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="operating-records">
            {!visible.length && (
              <p>
                No matching records. Add a record to start; no customer work or
                approvals are prefilled.
              </p>
            )}
            {visible.map((r) => (
              <article key={r.id}>
                <div>
                  <span className="record-category">{r.category}</span>
                  <h3>{r.title}</h3>
                  <p>
                    {r.owner || "Unassigned"} · {r.due || "No due date"} ·{" "}
                    {r.status}
                  </p>
                  <small>
                    {r.checks.filter((c) => c.done).length}/{r.checks.length}{" "}
                    review items marked
                  </small>
                </div>
                <button
                  disabled={busy || !enabled}
                  aria-label={`Edit operating record ${r.title}`}
                  onClick={() => {
                    if (
                      !draft ||
                      window.confirm("Discard unsaved record edits?")
                    )
                      setDraft({
                        ...r,
                        checks: r.checks.map((c) => ({ ...c })),
                      });
                  }}
                >
                  Open record
                </button>
              </article>
            ))}
          </div>
        </>
      )}
      {draft && draft.venture !== current && (
        <p className="venture-callout">
          An unsaved record is held in {draft.venture}. Return to that desk to
          finish it, or confirm discarding it when opening another record.
        </p>
      )}
      {draft && draft.venture === current && data && (
        <form
          className="venture-editor"
          aria-label="Operating record editor"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.venture !== current) return;
            void save({
              ...data,
              records: [
                ...data.records.filter((r) => r.id !== draft.id),
                draft,
              ],
            });
          }}
        >
          <h3>
            {data.records.some((r) => r.id === draft.id) ? "Edit" : "New"}{" "}
            {current === "Security Operations"
              ? "mission / assignment"
              : "operating record"}
          </h3>
          <div className="venture-fields">
            <label>
              Record title
              <input
                required
                maxLength={120}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <label>
              Category
              <select
                value={draft.category}
                onChange={(e) =>
                  setDraft({ ...draft, category: e.target.value })
                }
              >
                {profile.categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Responsible owner
              <input
                maxLength={100}
                value={draft.owner}
                onChange={(e) => setDraft({ ...draft, owner: e.target.value })}
              />
            </label>
            <label>
              Due date
              <input
                type="date"
                value={draft.due}
                onChange={(e) => setDraft({ ...draft, due: e.target.value })}
              />
            </label>
            <label>
              Operating status
              <select
                value={draft.status}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    status: e.target.value as OperatingRecord["status"],
                  })
                }
              >
                {recordStatuses.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Scope, location, evidence references and handover notes
            <textarea
              maxLength={4000}
              rows={5}
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </label>
          <fieldset>
            <legend>Readiness and handover review</legend>
            {draft.checks.map((c, i) => (
              <label className="venture-check" key={i}>
                <input
                  type="checkbox"
                  checked={c.done}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      checks: draft.checks.map((x, j) =>
                        j === i ? { ...x, done: e.target.checked } : x,
                      ),
                    })
                  }
                />
                {c.label}
              </label>
            ))}
          </fieldset>
          <p className="venture-evidence">
            Checklist source: {profile.source}. Operator marks are review notes,
            not verified licenses, flight clearance, dispatch or launch
            approval. Record evidence references and any not-applicable
            rationale in the notes.
          </p>
          <div className="venture-toolbar">
            <button className="primary-button" disabled={busy || !enabled}>
              Save operating record
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setDraft(null)}
            >
              Cancel edits
            </button>
          </div>
        </form>
      )}
      <details className="venture-readiness">
        <summary>
          <ShieldCheck size={16} aria-hidden="true" />
          Scope and readiness reference
        </summary>
        <ul>
          {profile.checks.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <p>
          {profile.source}. Based on supplied planning documents; no approvals
          or funding are represented as secured.
        </p>
        {current === "Aviation" && (
          <p>
            Ground-service planning only. Aircraft artwork is an original
            concept illustration. No flight dispatch, maintenance certification,
            live aircraft telemetry or airport access integration.
          </p>
        )}
        {current === "Security Operations" && (
          <p>
            No live surveillance, emergency dispatch or autonomous deployment.
            UAS products do not establish surveying or engineering conclusions.
            Firearms and range expansion remain separate conditional decisions.
          </p>
        )}
        {current === "Future Ventures" && (
          <p>
            No venture is automatically launched or funded by completing a
            checklist. Nexus commercialization and other opportunities can be
            recorded for feasibility review.
          </p>
        )}
      </details>
      {data && (
        <details className="venture-readiness">
          <summary>Restore private venture backup</summary>
          <p>
            Restoring replaces all four venture desks. Export your current
            backup first. Co-hosting records and imported knowledge are separate
            and are not included.
          </p>
          <label>
            Venture backup JSON
            <input
              type="file"
              accept=".json,application/json"
              disabled={busy || !enabled}
              onChange={(e) => void readBackup(e.target.files?.[0])}
            />
          </label>
          {restore && (
            <div>
              <p>
                Replace {data.records.length} saved records with{" "}
                {restore.records.length} backup records?
              </p>
              <button
                disabled={busy || !enabled}
                onClick={() => {
                  if (
                    window.confirm(
                      "Replace all saved venture records with this backup?",
                    )
                  )
                    void save({ ...restore, revision: data.revision });
                }}
              >
                Confirm replace venture records
              </button>
              <button onClick={() => setRestore(null)}>Cancel restore</button>
            </div>
          )}
        </details>
      )}
      <div className="venture-footer">
        {data ? `Laptop revision ${data.revision} · ` : ""}Saved records feed
        Nexus knowledge search. External systems and financial ledgers are not
        connected.
      </div>
    </section>
  );
}
