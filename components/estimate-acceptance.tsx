"use client";
import { useState } from "react";
import type { Acceptance, Quote } from "@/lib/business";
export default function EstimateAcceptance({
  quote,
  isTest,
  disabled,
  save,
  cancel,
}: {
  quote: Quote;
  isTest: boolean;
  disabled: boolean;
  save: (a: Acceptance) => Promise<void>;
  cancel: () => void;
}) {
  const [acceptedBy, setAcceptedBy] = useState(isTest ? "Test owner" : ""),
    [method, setMethod] = useState<Acceptance["method"]>(
      isTest ? "Test" : "Email",
    ),
    [reference, setReference] = useState(
      isTest ? "Synthetic acceptance for internal rehearsal" : "",
    ),
    [recordedBy, setRecordedBy] = useState(isTest ? "Test operator" : ""),
    [confirmed, setConfirmed] = useState(false);
  return (
    <form
      aria-label={"Record acceptance · " + quote.name}
      onSubmit={(e) => {
        e.preventDefault();
        void save({ acceptedBy, method, reference, recordedBy, confirmed });
      }}
    >
      <h4>Record exact-version acceptance · version {quote.version || 1}</h4>
      <p>
        {isTest
          ? "Marked test record. This acceptance is a rehearsal."
          : "Record an actual customer response after reviewing the scope and before-tax price. This is an operator record, not a customer portal signature."}
      </p>
      <label>
        Accepted by
        <input
          required
          maxLength={160}
          value={acceptedBy}
          onChange={(e) => setAcceptedBy(e.target.value)}
        />
      </label>
      <label>
        Acceptance method
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value as Acceptance["method"])}
        >
          {(isTest
            ? ["Test"]
            : ["Email", "Phone", "Signed document", "In person"]
          ).map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <label>
        Acceptance reference
        <input
          required
          maxLength={500}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Date and reference for the customer's response; no passwords."
        />
      </label>
      <label>
        Recorded by
        <input
          required
          maxLength={160}
          value={recordedBy}
          onChange={(e) => setRecordedBy(e.target.value)}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        I reviewed this estimate's scope and price and have an acceptance
        reference.
      </label>
      <button disabled={disabled || !confirmed}>
        Record customer acceptance
      </button>
      <button type="button" disabled={disabled} onClick={cancel}>
        Cancel acceptance
      </button>
    </form>
  );
}
