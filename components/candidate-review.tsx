"use client";
import CandidateVerification from "./candidate-verification";
import { useState } from "react";
import type { FoundationSnapshot, NexusTask } from "@/lib/foundation/contracts";
export default function CandidateReview({
  task,
  reviews,
  testRuns,
  verifications,
  disabled,
  mutate,
}: {
  task: NexusTask;
  reviews: NonNullable<FoundationSnapshot["candidateReviews"]>;
  testRuns: NonNullable<FoundationSnapshot["candidateTestRuns"]>;
  verifications: NonNullable<FoundationSnapshot["candidateVerifications"]>;
  disabled: boolean;
  mutate: (body: unknown) => Promise<unknown>;
}) {
  const [confirmed, setConfirmed] = useState("");
  const [note, setNote] = useState("");
  const [runConsent, setRunConsent] = useState("");
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
        Validate and review the saved code first. Accepted candidates can run
        limited synchronous utility tests in an isolated WebAssembly engine. No
        candidate runs in Node or installs or activates a skill.
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
            Static validation: type check {review.report.typecheck || "pending"}
            . Tests were not run during this check.
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
          {review.state === "accepted-for-tests" && (
            <>
              <p>
                The runner supports synchronous node:test and a small assert
                API, candidate-relative imports, and en-US USD formatting. No
                network, files, processes, timers, external packages or
                asynchronous tests. Results cover candidate-supplied tests, not
                independent verification.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={runConsent === identity}
                  onChange={(e) =>
                    setRunConsent(e.target.checked ? identity : "")
                  }
                />
                I approve one isolated test run of this exact candidate.
              </label>
              <button
                disabled={
                  disabled ||
                  runConsent !== identity ||
                  testRuns.some((r) => r.state === "running")
                }
                onClick={() => {
                  setRunConsent("");
                  void mutate({
                    op: "candidate.test",
                    reviewId: review.id,
                    reviewRevision: review.revision,
                    taskRevision: task.revision,
                    candidateHash: artifact.sha256,
                    confirmIsolatedRun: true,
                  });
                }}
              >
                Run isolated tests
              </button>
            </>
          )}
          <CandidateVerification
            task={task}
            review={review}
            sourcePaths={
              Array.isArray(artifact.candidate.files)
                ? artifact.candidate.files.map((f: { path: string }) => f.path)
                : []
            }
            supplied={testRuns}
            verifications={verifications}
            disabled={disabled}
            mutate={mutate}
          />
          {testRuns
            .filter(
              (r) =>
                r.taskId === task.id &&
                r.candidateHash === artifact.sha256 &&
                r.taskRevision === task.revision,
            )
            .slice(0, 3)
            .map((run) => (
              <section aria-label="Isolated test result" key={run.id}>
                <p role="status">
                  Isolated tests: {run.state} · {run.report.passed || 0} passed
                  · {run.report.failed || 0} failed
                </p>
                <p>
                  {run.report.engine || "QuickJS WebAssembly"} ·
                  candidate-supplied tests only · not installed or promoted
                </p>
                {run.report.error && <p>{run.report.error}</p>}
                {run.report.tests?.map((t, i) => (
                  <p key={i}>
                    {t.name}: {t.status}
                    {t.detail ? " — " + t.detail : ""}
                  </p>
                ))}
              </section>
            ))}
        </>
      )}
    </section>
  );
}
