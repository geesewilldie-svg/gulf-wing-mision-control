"use client";
import { useEffect, useRef, useState } from "react";
import { type BusinessState } from "@/lib/business";
import CohostingWorkspace from "./cohosting-workspace";

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
  const [newer, setNewer] = useState(false);
  const [dirty, setDirty] = useState(false);
  const working = useRef(false);
  const load = async () => {
    setBusy(true);
    working.current = true;
    try {
      const r = await fetch("/api/sync/business");
      const data = await r.json();
      if (!r.ok) throw Error(data.error);
      setState(data);
      setNewer(false);
      setDirty(false);
      setMessage("Loaded saved laptop records.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
      working.current = false;
    }
  };
  useEffect(() => {
    if (!state) return;
    const controller = new AbortController();
    const timer = setInterval(async () => {
      if (working.current || document.hidden) return;
      try {
        const r = await fetch("/api/sync/business", {
          signal: controller.signal,
        });
        if (!r.ok) return;
        const latest = await r.json();
        if (controller.signal.aborted || working.current) return;
        if (latest.revision !== state.revision) {
          if (dirty) {
            setNewer(true);
          } else {
            setState(latest);
            setNewer(false);
          }
        }
      } catch {}
    }, 8000);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [state, dirty]);
  const save = async (next: BusinessState) => {
    if (working.current || disabled) return false;
    working.current = true;
    const previous = state;
    setState(next);
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/sync/business", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await r.json();
      if (!r.ok) {
        if (r.status === 409) setNewer(true);
        throw Error(data.error);
      }
      setState(data);
      setDirty(false);
      setNewer(false);
      setMessage(
        "Saved to laptop. No external messages, billing or ad changes.",
      );
      return true;
    } catch (e) {
      setState(previous);
      setMessage((e as Error).message);
      return false;
    } finally {
      setBusy(false);
      working.current = false;
    }
  };
  return (
    <section className="nexus-card">
      <h2>{marketing ? "Marketing planning" : "Co-hosting operations"}</h2>
      {!state ? (
        <>
          <p>
            Load private laptop records after pairing. These records are
            separate from the dashboard DEMO missions.
          </p>
          <button onClick={load} disabled={busy}>
            Load business records
          </button>
        </>
      ) : (
        <>
          <div className="business-toolbar">
            <button
              onClick={() => {
                if (
                  !dirty ||
                  window.confirm(
                    "Reload saved records? Unsaved form edits will need review against the latest version.",
                  )
                )
                  void load();
              }}
              disabled={busy}
            >
              Reload latest records
            </button>
            <span>Saved revision {state.revision} · shared laptop storage</span>
          </div>
          {newer && (
            <p role="alert">
              Another device changed these records. Your form is retained.
              Reload latest records before saving again; review your changes
              against the saved version.
            </p>
          )}
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
                  {(["total", "meta", "google", "linkedin"] as const).map(
                    (key) => (
                      <label key={key}>
                        {
                          {
                            total: "Proposed monthly total",
                            meta: "Meta / Facebook",
                            google: "Google Ads",
                            linkedin: "LinkedIn",
                          }[key]
                        }{" "}
                        ($)
                        <input
                          type="number"
                          min="0"
                          max="1000000"
                          step="0.01"
                          required
                          disabled={disabled || busy}
                          value={state.marketing[key]}
                          onChange={(e) => {
                            setDirty(true);
                            setState({
                              ...state,
                              marketing: {
                                ...state.marketing,
                                [key]: Number(e.target.value),
                              },
                            });
                          }}
                        />
                      </label>
                    ),
                  )}
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
                <button disabled={disabled || busy || newer}>
                  Save proposed allocation
                </button>
              </form>
              <p>
                Nexus has no live campaign metrics yet. Evaluation requires
                actual spend, qualified leads, signed customers, gross
                contribution and tracking quality.
              </p>
            </>
          ) : (
            <CohostingWorkspace
              state={state}
              save={save}
              disabled={disabled || busy || newer}
              onDirty={setDirty}
            />
          )}
          <details>
            <summary>Local change history</summary>
            <ul>
              {state.audit.map((entry, i) => (
                <li key={i}>{entry}</li>
              ))}
            </ul>
          </details>
        </>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
