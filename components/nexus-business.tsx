"use client";
import { useState } from "react";
import { type BusinessState, type BusinessRecord } from "@/lib/business";
import { estimateService } from "@/lib/nexus";
export default function NexusBusiness({
  marketing = false,
  disabled = false,
}: {
  marketing?: boolean;
  disabled?: boolean;
}) {
  const [state, setState] = useState<BusinessState | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [kind, setKind] = useState<BusinessRecord["kind"]>("Lead");
  const [quoteName, setQuoteName] = useState("");
  const [quote, setQuote] = useState({
    hours: 2,
    wage: 22,
    burden: 18.65,
    materials: 20,
    margin: 30,
  });
  const load = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/sync/business");
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setState(data);
      setMessage("Loaded saved laptop records.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const save = async (next: BusinessState) => {
    setBusy(true);
    try {
      const r = await fetch("/api/sync/business", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setState(data);
      setMessage(
        "Saved to laptop. No external messages, billing or ad changes.",
      );
      return true;
    } catch (e) {
      setMessage((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  if (!state)
    return (
      <section className="nexus-card">
        <h2>{marketing ? "Marketing planning" : "Co-hosting operations"}</h2>
        <p>
          Load private laptop records after pairing. These records are separate
          from the dashboard DEMO missions.
        </p>
        <button onClick={load} disabled={busy}>
          Load business records
        </button>
        <p role="status">{message}</p>
      </section>
    );
  const estimate = estimateService(
    quote.hours,
    quote.wage,
    quote.burden,
    quote.materials,
    quote.margin,
  );
  return (
    <section className="nexus-card">
      <h2>{marketing ? "Marketing planning" : "Co-hosting operations"}</h2>
      <button onClick={load} disabled={busy}>
        Reload latest records
      </button>
      {marketing ? (
        <>
          <p>
            PROPOSED BUDGET ONLY · No ad accounts connected · No spending or
            campaign changes enabled. $500 is the business-plan starting
            assumption, not an approved budget.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save(state);
            }}
          >
            <div className="nexus-fields">
              {(["total", "meta", "google", "linkedin"] as const).map((key) => (
                <label key={key}>
                  {key === "total"
                    ? "Proposed monthly total"
                    : key === "meta"
                      ? "Meta / Facebook"
                      : key === "google"
                        ? "Google Ads"
                        : "LinkedIn"}{" "}
                  ($)
                  <input
                    type="number"
                    min="0"
                    max="1000000"
                    step="0.01"
                    required
                    disabled={disabled || busy}
                    value={state.marketing[key]}
                    onChange={(e) =>
                      setState({
                        ...state,
                        marketing: {
                          ...state.marketing,
                          [key]: Number(e.target.value),
                        },
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <p>
              Unallocated: $
              {(
                state.marketing.total -
                state.marketing.meta -
                state.marketing.google -
                state.marketing.linkedin
              ).toFixed(2)}
            </p>
            <button disabled={disabled || busy}>
              Save proposed allocation
            </button>
          </form>
          <p>
            Nexus has no live campaign metrics yet. Evaluation will require
            spend, qualified leads, signed customers, gross contribution, and
            tracking quality. No campaign performance or recommended spend is
            fabricated.
          </p>
        </>
      ) : (
        <>
          <p>
            Service-first operations: cleaning, readiness, owner support and
            approved vendor coordination. Rental advertising, rate-setting,
            bookings and rent collection are outside the supplied unlicensed
            operating plan.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await save({
                  ...state,
                  records: [
                    ...state.records,
                    {
                      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                      kind,
                      name: name.trim(),
                      notes,
                      status: "Planned",
                    },
                  ],
                })
              ) {
                setName("");
                setNotes("");
              }
            }}
          >
            <div className="nexus-fields">
              <label>
                Record type
                <select
                  value={kind}
                  onChange={(e) =>
                    setKind(e.target.value as BusinessRecord["kind"])
                  }
                >
                  <option>Lead</option>
                  <option>Property</option>
                  <option>Job</option>
                </select>
              </label>
              <label>
                Name
                <input
                  required
                  maxLength={160}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
            </div>
            <label>
              Notes (do not store passwords or access codes)
              <textarea
                maxLength={2000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <button disabled={disabled || busy}>Add operating record</button>
          </form>
          <ul className="nexus-records">
            {state.records.map((record) => (
              <li key={record.id}>
                <strong>
                  {record.kind}: {record.name}
                </strong>
                <p>{record.notes}</p>
                <button
                  disabled={disabled || busy}
                  onClick={() =>
                    void save({
                      ...state,
                      records: state.records.map((r) =>
                        r.id === record.id
                          ? {
                              ...r,
                              status:
                                r.status === "Planned"
                                  ? "Active"
                                  : r.status === "Active"
                                    ? "Complete"
                                    : "Planned",
                            }
                          : r,
                      ),
                    })
                  }
                >
                  {record.status} · Advance
                </button>
              </li>
            ))}
          </ul>
          <h3>Draft service estimate</h3>
          <p>
            Planning calculator only. Tax, travel, overhead, scope and final
            pricing need review; no customer quote is sent.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await save({
                  ...state,
                  quotes: [
                    ...state.quotes,
                    {
                      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                      name: quoteName.trim(),
                      ...quote,
                    },
                  ],
                })
              )
                setQuoteName("");
            }}
          >
            <label>
              Estimate name
              <input
                required
                maxLength={160}
                value={quoteName}
                onChange={(e) => setQuoteName(e.target.value)}
              />
            </label>
            <div className="nexus-fields">
              {(
                ["hours", "wage", "burden", "materials", "margin"] as const
              ).map((key) => (
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
                      setQuote({ ...quote, [key]: Number(e.target.value) })
                    }
                  />
                </label>
              ))}
            </div>
            <p>
              Direct cost: ${estimate.cost.toFixed(2)} · Draft price before tax:
              ${estimate.price.toFixed(2)}
            </p>
            <button disabled={disabled || busy}>Save draft estimate</button>
          </form>
          <ul className="nexus-records">
            {state.quotes.map((q) => (
              <li key={q.id}>
                {q.name} · $
                {estimateService(
                  q.hours,
                  q.wage,
                  q.burden,
                  q.materials,
                  q.margin,
                ).price.toFixed(2)}{" "}
                before tax · DRAFT
              </li>
            ))}
          </ul>
        </>
      )}
      <details>
        <summary>Local change history</summary>
        <ul>
          {state.audit.map((entry, i) => (
            <li key={i}>{entry}</li>
          ))}
        </ul>
      </details>
      <p role="status">{message}</p>
    </section>
  );
}
