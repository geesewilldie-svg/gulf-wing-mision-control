"use client";
import { useState } from "react";
import type { FoundationSnapshot, NexusTask } from "@/lib/foundation/contracts";
import contract from "@/lib/foundation/usd-contract.json";
type Review = NonNullable<FoundationSnapshot["candidateReviews"]>[number];
export default function CandidateVerification({
  task,
  review,
  sourcePaths,
  supplied,
  verifications,
  disabled,
  mutate,
}: {
  task: NexusTask;
  review: Review;
  sourcePaths: string[];
  supplied: NonNullable<FoundationSnapshot["candidateTestRuns"]>;
  verifications: NonNullable<FoundationSnapshot["candidateVerifications"]>;
  disabled: boolean;
  mutate: (body: unknown) => Promise<any>;
}) {
  const [consent, setConsent] = useState("");
  const [preview, setPreview] = useState<{
    identity: string;
    manifest: unknown;
    manifestHash: string;
  } | null>(null);
  const [stageConsent, setStageConsent] = useState("");
  const latestSupplied = supplied.find(
    (r) =>
      r.taskId === task.id &&
      r.taskRevision === task.revision &&
      r.reviewId === review.id &&
      r.candidateHash === review.candidateHash,
  );
  const latest = verifications.find((v) => v.taskId === task.id);
  const identity = `${review.id}:${review.revision}:${task.revision}:${review.candidateHash}:${latestSupplied?.id}:${latest?.id}`;
  const payload = {
    reviewId: review.id,
    reviewRevision: review.revision,
    taskRevision: task.revision,
    candidateHash: review.candidateHash,
  };
  const allowed =
    review.state === "accepted-for-tests" && latestSupplied?.state === "passed";
  const current =
    latest?.state === "passed" &&
    latest.candidateHash === review.candidateHash &&
    latest.taskRevision === task.revision &&
    latest.reviewRevision === review.revision &&
    latest.testRunId === latestSupplied?.id;
  return (
    <section aria-label="Independent verification">
      <h4>Independent verification and inactive package</h4>
      <p>
        USD formatter v1: {contract.cases.length} fixed host-side checks.
        Candidate test code is not used for these decisions. This is a sampled
        behavior contract, not proof of correctness for every input.
      </p>
      {!sourcePaths.includes(contract.sourcePath) ? (
        <p>
          No independent profile supports this candidate yet. The first profile
          requires {contract.sourcePath} exporting {contract.exportName}.
        </p>
      ) : (
        <>
          <label>
            <input
              type="checkbox"
              checked={consent === identity}
              disabled={!allowed || disabled}
              onChange={(e) => setConsent(e.target.checked ? identity : "")}
            />
            I approve one independent USD contract check of this exact
            candidate.
          </label>
          <button
            disabled={
              disabled ||
              !allowed ||
              consent !== identity ||
              verifications.some((v) => v.state === "running") ||
              supplied.some((r) => r.state === "running")
            }
            onClick={() => {
              setConsent("");
              setPreview(null);
              void mutate({
                op: "candidate.verify",
                ...payload,
                confirmIndependent: true,
              });
            }}
          >
            Run independent verification
          </button>
        </>
      )}
      {latest && (
        <>
          <p role="status">
            Independent verification: {latest.state} ·{" "}
            {latest.report.passed || 0} passed · {latest.report.failed || 0}{" "}
            failed
          </p>
          {latest.report.error && <p>{latest.report.error}</p>}
          {latest.report.tests?.map((t, i) => (
            <p key={i}>
              {t.name}: {t.status}
              {t.detail ? " — " + t.detail : ""}
            </p>
          ))}
          <button
            disabled={disabled || !current}
            onClick={async () => {
              setStageConsent("");
              const r = await mutate({
                op: "candidate.package.preview",
                ...payload,
                verificationId: latest.id,
              });
              if (r?.manifestHash) setPreview({ ...r, identity });
            }}
          >
            Preview inactive package
          </button>
        </>
      )}
      {preview?.identity === identity && (
        <>
          <p>
            Review this exact package. Staging stores an immutable private
            package in Nexus. It does not edit project files, activate a skill,
            merge, deploy or change estimates.
          </p>
          <pre>{JSON.stringify(preview.manifest, null, 2)}</pre>
          <p style={{ overflowWrap: "anywhere" }}>
            Package SHA-256: {preview.manifestHash}
          </p>
          <label>
            <input
              type="checkbox"
              checked={stageConsent === preview.manifestHash}
              onChange={(e) =>
                setStageConsent(e.target.checked ? preview.manifestHash : "")
              }
            />
            I approve storing this exact package as inactive.
          </label>
          <button
            disabled={
              disabled || !current || stageConsent !== preview.manifestHash
            }
            onClick={async () => {
              setStageConsent("");
              const r = await mutate({
                op: "candidate.package.stage",
                ...payload,
                verificationId: latest!.id,
                previewHash: preview.manifestHash,
                confirmStage: true,
              });
              if (r) setPreview(null);
            }}
          >
            Stage inactive package
          </button>
        </>
      )}
    </section>
  );
}
