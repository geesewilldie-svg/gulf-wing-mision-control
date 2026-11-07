"use client";
import { useState } from "react";
import type { FoundationSnapshot, NexusTask } from "@/lib/foundation/contracts";
export default function CandidateReview({
  task,
  reviews,
  disabled,
  mutate,
}: {
  task: NexusTask;
  reviews: NonNullable<FoundationSnapshot["candidateReviews"]>;
  disabled: boolean;
  mutate: (body: unknown) => Promise<unknown>;
}) {
  const [confirmed, setConfirmed] = useState("");
  const [note, setNote] = useState("");
  let artifact;
  try {
    artifact = JSON.parse(task.output);
  } catch {
    return null;
  }
  if (
    !artifact?.candidate ||
    typeof artifact.sha256 !== "string" ||
    task.state !== "waiting"
  )
    return null;
  const review = reviews.find(
    (r) =>
      r.taskId === task.id &&
      r.taskRevision === task.revision &&
      r.candidateHash === artifact.sha256,
  );
  const identity = review ? `${review.id}:${review.revision}` : "";
  const decide = (decision: string) =>
    mutate({
      op: "candidate.decide",
      reviewId: review!.id,
      reviewRevision: review!.revision,
      taskRevision: task.revision,
      candidateHash: artifact.sha256,
      decision,
      confirmReviewed: true,
      note,
    });
  return (
    <section aria-label="Candidate review">
      <h4>Candidate review</h4>
      <p>
        Static checks only. Generated code and tests are not executed.
        Acceptance records readiness for a future isolated test stage; it does
        not install or activate a skill.
      </p>
      <button
        disabled={disabled || review?.state === "checking"}
        onClick={() =>
          mutate({
            op: "candidate.validate",
            id: task.id,
            revision: task.revision,
          })
        }
      >
        Validate saved candidate
      </button>
      {review && (
        <>
          <p role="status">
            {review.state} · task revision {review.taskRevision} · TypeScript{" "}
            {review.report.compilerVersion || "unavailable"}
          </p>
          <p style={{ overflowWrap: "anywhere" }}>
            SHA-256: {review.candidateHash}
          </p>
          <p>
            Type check: {review.report.typecheck || "pending"}. Tests: not run.
            Code execution: not run.
          </p>
          {review.report.failure && <p>{review.report.failure}</p>}
          {review.report.diagnostics?.map((d, i) => (
            <p key={i}>
              {d.file}:{d.line} · TS{d.code}: {d.message}
            </p>
          ))}
          {review.report.risks?.map((risk, i) => (
            <p key={i}>{risk}</p>
          ))}
          <p>
            Test files:{" "}
            {review.report.testFiles?.join(", ") || "none identified"}. Import
            warnings are incomplete; passing checks do not establish security or
            correctness.
          </p>
          <label>
            <input
              type="checkbox"
              checked={confirmed === identity}
              onChange={(e) => setConfirmed(e.target.checked ? identity : "")}
            />
            I reviewed this exact saved artifact and report.
          </label>
          <label>
            Review note
            <textarea
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <button
            disabled={
              disabled ||
              confirmed !== identity ||
              review.report.typecheck !== "passed"
            }
            onClick={() => decide("accept-for-tests")}
          >
            Accept for isolated testing
          </button>
          <button
            disabled={
              disabled || confirmed !== identity || review.state === "checking"
            }
            onClick={() => decide("reject")}
          >
            Reject candidate
          </button>
          {review.note && <p>Saved owner note: {review.note}</p>}
        </>
      )}
    </section>
  );
}
