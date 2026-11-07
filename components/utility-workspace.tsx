"use client";
import { useState } from "react";
import {
  scopes,
  type Scope,
  type FoundationSnapshot,
} from "@/lib/foundation/contracts";
export default function UtilityWorkspace({
  data,
  disabled,
  mutate,
}: {
  data: FoundationSnapshot;
  disabled: boolean;
  mutate: (body: unknown) => Promise<any>;
}) {
  const [scope, setScope] = useState<Scope>("Personal"),
    [amount, setAmount] = useState("12.50"),
    [preview, setPreview] = useState<any>(null),
    [consent, setConsent] = useState(""),
    [result, setResult] = useState<any>(null);
  const binding = data.utilityBindings?.find(
    (b) => b.scope === scope && b.profileId === "usd-format-v1",
  );
  const rev = binding?.revision || 0;
  const active = binding?.packageId || null;
  const shownPreview =
    preview?.proposal?.scope === scope &&
    preview.proposal.bindingRevision === rev &&
    preview.proposal.fromPackageId === active &&
    (data.candidatePackages || []).some(
      (p) =>
        p.id === preview.proposal.toPackageId &&
        p.revision === preview.proposal.packageRevision &&
        p.state === "inactive",
    );
  const change = (action: string) => {
    setResult(null);
    setPreview(null);
    setConsent("");
    return mutate({
      op: "utility.change",
      scope,
      bindingRevision: rev,
      action,
      confirmChange: true,
    });
  };
  return (
    <section className="nexus-card" aria-label="Inactive packages">
      <h3>Utility packages and activation</h3>
      <p>
        Verified packages can power the manual USD tool in one workspace.
        Activation runs in isolation and does not edit project files or change
        estimates, accounting or payments.
      </p>
      <label>
        Utility workspace
        <select
          value={scope}
          onChange={(e) => {
            setScope(e.target.value as Scope);
            setPreview(null);
            setConsent("");
            setResult(null);
          }}
        >
          {scopes.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <p role="status">
        USD tool: {active ? "isolated package active" : "built-in formatter"} ·
        binding revision {rev}
      </p>
      {active && (
        <p style={{ overflowWrap: "anywhere" }}>Active package: {active}</p>
      )}
      <button disabled={disabled || !active} onClick={() => change("rollback")}>
        {binding?.previousPackageId
          ? "Roll back to previous package"
          : "Roll back to built-in formatter"}
      </button>
      <button disabled={disabled || !active} onClick={() => change("disable")}>
        Disable isolated utility
      </button>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setResult(null);
          const r = await mutate({ op: "utility.run", scope, amount });
          if (r) setResult({ ...r, scope });
        }}
      >
        <label>
          USD amount
          <input
            required
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <button disabled={disabled}>Format USD</button>
      </form>
      {result?.scope === scope &&
        (result.error ? (
          <p role="status">{result.error}</p>
        ) : result.bindingRevision === rev && result.packageId === active ? (
          <p role="status">
            Formatted USD: {result.text} ·{" "}
            {result.source === "isolated-package"
              ? "isolated package"
              : "built-in formatter"}
          </p>
        ) : null)}
      {(data.candidatePackages || []).length === 0 && (
        <p>No packages staged.</p>
      )}
      {(data.candidatePackages || []).map((p) => {
        const ownerScope = data.tasks.find((t) => t.id === p.taskId)?.scope;
        return (
          <article key={p.id} aria-label={"Package: " + p.id}>
            <p>
              Package: {p.state} · {p.profileId} · revision {p.revision}
            </p>
            <p>Workspace: {ownerScope || "unavailable"}</p>
            <p style={{ overflowWrap: "anywhere" }}>
              Candidate SHA-256: {p.candidateHash} · package SHA-256:{" "}
              {p.manifestHash}
            </p>
            <button
              disabled={
                disabled ||
                p.state !== "inactive" ||
                p.id === active ||
                ownerScope !== scope
              }
              onClick={async () => {
                setConsent("");
                const r = await mutate({
                  op: "utility.preview",
                  scope,
                  packageId: p.id,
                  packageRevision: p.revision,
                  bindingRevision: rev,
                });
                if (r?.proposal) setPreview(r);
              }}
            >
              Preview isolated activation
            </button>
            <button
              disabled={disabled || p.state !== "inactive"}
              onClick={() =>
                mutate({
                  op: "candidate.package.revoke",
                  packageId: p.id,
                  packageRevision: p.revision,
                  confirmRevoke: true,
                })
              }
            >
              Revoke inactive package
            </button>
          </article>
        );
      })}
      {shownPreview && (
        <>
          <h4>Review isolated activation</h4>
          <pre>{JSON.stringify(preview.proposal, null, 2)}</pre>
          <p style={{ overflowWrap: "anywhere" }}>
            Activation SHA-256: {preview.previewHash}
          </p>
          <label>
            <input
              type="checkbox"
              checked={consent === preview.previewHash}
              onChange={(e) =>
                setConsent(e.target.checked ? preview.previewHash : "")
              }
            />
            I approve this exact isolated activation.
          </label>
          <button
            disabled={disabled || consent !== preview.previewHash}
            onClick={async () => {
              setConsent("");
              setResult(null);
              const r = await mutate({
                op: "utility.activate",
                scope,
                packageId: preview.proposal.toPackageId,
                packageRevision: preview.proposal.packageRevision,
                bindingRevision: rev,
                previewHash: preview.previewHash,
                confirmActivation: true,
              });
              if (r) setPreview(null);
            }}
          >
            Activate isolated USD utility
          </button>
        </>
      )}
      <details>
        <summary>Utility version history</summary>
        {(data.utilityHistory || [])
          .filter((h) => h.scope === scope)
          .slice(0, 10)
          .map((h) => (
            <p key={h.id}>
              {h.kind} · revision {h.bindingRevision} · {h.at}
            </p>
          ))}
      </details>
    </section>
  );
}
