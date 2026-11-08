"use client";
import { useState } from "react";
import type { BusinessRecord, JobPhase } from "@/lib/business";
export default function JobCompletion({
  record,
  disabled,
  save,
  onDirty,
}: {
  record: BusinessRecord;
  disabled: boolean;
  save: (r: BusinessRecord) => Promise<boolean>;
  onDirty: (dirty: boolean) => void;
}) {
  const review = record.review!;
  const [summary, setSummary] = useState(review.summary || ""),
    [reviewer, setReviewer] = useState(""),
    [note, setNote] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const move = async (phase: JobPhase) => {
    const status =
      phase === "Accepted"
        ? "Complete"
        : phase === "Scheduled"
          ? "Planned"
          : "Active";
    if (
      await save({
        ...record,
        status,
        review: { ...review, phase, summary, reviewer, note, confirmed },
      })
    )
      onDirty(false);
  };
  return (
    <section aria-label={"Completion review · " + record.name}>
      <p>
        Job phase: <strong>{review.phase}</strong> · submission{" "}
        {review.submissionVersion}
      </p>
      {review.phase === "Legacy unreviewed" && (
        <p>
          Historical completion status has no current review approval. Reopen to
          document and review the work.
        </p>
      )}
      {["Scheduled", "Rework", "Legacy unreviewed"].includes(review.phase) && (
        <button disabled={disabled} onClick={() => move("In progress")}>
          {review.phase === "Scheduled"
            ? "Start job"
            : review.phase === "Rework"
              ? "Resume rework"
              : "Reopen for documented review"}
        </button>
      )}
      {review.phase === "In progress" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void move("Review required");
          }}
        >
          <label>
            Completion summary
            <textarea
              aria-label="Completion summary"
              required
              minLength={10}
              maxLength={2000}
              value={summary}
              onChange={(e) => {
                setSummary(e.target.value);
                onDirty(true);
              }}
              placeholder="Describe work completed, exceptions and what the reviewer should check."
            />
          </label>
          <button
            disabled={
              disabled ||
              !record.checklist?.length ||
              record.checklist.some((c) => !c.done)
            }
          >
            Submit for completion review
          </button>
        </form>
      )}
      {review.phase === "Review required" && (
        <p>Submission summary: {review.summary}</p>
      )}
      {["Review required", "Accepted"].includes(review.phase) && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void move("Accepted");
          }}
        >
          <p>
            Human review only. Checklist entries and a summary do not prove
            physical work quality. No payment or invoice is triggered.
          </p>
          <label>
            Completion reviewer
            <input
              required
              minLength={2}
              maxLength={160}
              value={reviewer}
              onChange={(e) => {
                setReviewer(e.target.value);
                onDirty(true);
              }}
            />
          </label>
          <label>
            Review decision note
            <textarea
              aria-label="Review decision note"
              required
              minLength={10}
              maxLength={1000}
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                onDirty(true);
              }}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => {
                setConfirmed(e.target.checked);
                onDirty(true);
              }}
            />
            I have reviewed this submission and am recording a human decision.
          </label>
          {review.phase === "Review required" && (
            <button disabled={disabled || !confirmed}>
              Accept reviewed completion
            </button>
          )}
          <button
            type="button"
            disabled={
              disabled ||
              !confirmed ||
              reviewer.trim().length < 2 ||
              note.trim().length < 10
            }
            onClick={() => move("Rework")}
          >
            Request rework
          </button>
        </form>
      )}
      {review.history.length > 0 && (
        <details>
          <summary>Completion review history</summary>
          {review.history.map((h, i) => (
            <p key={i}>
              Submission {h.submissionVersion} · {h.decision} · {h.reviewer} ·{" "}
              {h.at} · {h.note}
              {h.origin === "restored-unverified"
                ? " · restored, unverified history"
                : " · operator-recorded decision"}
            </p>
          ))}
        </details>
      )}
    </section>
  );
}
