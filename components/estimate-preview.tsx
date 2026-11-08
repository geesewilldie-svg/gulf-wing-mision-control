"use client";
import { useEffect, useState } from "react";
import { type BusinessState } from "@/lib/business";
import { estimateService } from "@/lib/nexus";
export default function EstimatePreview({ id }: { id: string }) {
  const [state, setState] = useState<BusinessState | null>(null);
  const [message, setMessage] = useState("Loading saved estimate…");
  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/sync/business", { signal: abort.signal })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw Error(data.error);
        setState(data);
        setMessage("");
      })
      .catch((e) => {
        if (!abort.signal.aborted) setMessage(e.message);
      });
    return () => abort.abort();
  }, []);
  const quote = state?.quotes.find((q) => q.id === id);
  const record = state?.records.find((r) => r.id === quote?.recordId);
  const total =
    quote?.acceptance?.priceCents !== undefined
      ? quote.acceptance.priceCents / 100
      : quote
        ? estimateService(
            quote.hours,
            quote.wage,
            quote.burden,
            quote.materials,
            quote.margin,
          ).price
        : 0;
  return (
    <main className="nexus-console estimate-print">
      <div className="no-print nexus-buttons">
        <a href="/nexus">← Nexus</a>
        <button disabled={!quote} onClick={() => window.print()}>
          Print / Save as PDF
        </button>
      </div>
      <h1>Gulf Wing Co-hosting</h1>
      {(record?.isTest || quote?.isTest) && (
        <p>TEST ESTIMATE · internal rehearsal only</p>
      )}
      <p>Service estimate · {(quote?.status || "Draft").toUpperCase()}</p>
      {message && <p role="status">{message}</p>}
      {state && !quote && (
        <p>Estimate not found. Open it again from the saved estimate list.</p>
      )}
      {quote && (
        <article>
          <h2>{quote.name}</h2>
          <p>Estimate reference: {quote.id}</p>
          <h3>Prepared for</h3>
          <p>
            {quote.acceptance?.customerName ||
              record?.contact ||
              record?.name ||
              "Customer to be confirmed"}
          </p>
          <p>{quote.acceptance?.address || record?.address}</p>
          <h3>Scope</h3>
          <p className="preserve-lines">
            {quote.scope ||
              "Scope and exclusions must be agreed before work begins."}
          </p>
          <p>
            Service:{" "}
            {quote.acceptance?.serviceName ||
              state?.services.find((s) => s.id === quote.serviceId)?.name ||
              "As described in scope"}
          </p>
          <p>
            Estimate version {quote.version || 1}
            {quote.acceptance
              ? " · acceptance recorded by " +
                quote.acceptance.recordedBy +
                " on " +
                quote.acceptance.recordedAt
              : ""}
          </p>
          {quote.acceptance?.origin === "restored-unverified" && (
            <p>Restored acceptance is historical and unverified.</p>
          )}
          <h3>Estimated service price before tax</h3>
          <p className="estimate-total">${total.toFixed(2)}</p>
          <p>
            Tax, additional work, travel and exclusions must be confirmed in
            writing. This estimate is not an invoice or proof of payment. Work
            starts only after agreed scope, schedule, customer authorization and
            applicable requirements are confirmed.
          </p>
        </article>
      )}
    </main>
  );
}
