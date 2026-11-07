import { Worker } from "node:worker_threads";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  validateCandidate,
  type CodeCandidate,
} from "../../foundation/candidate";
import { SyncError } from "../sync-store";
export type ValidationReport = {
  validator: string;
  compilerVersion?: string;
  typecheck: "passed" | "failed" | "not-applicable";
  diagnostics: {
    code: number;
    file: string | null;
    line: number | null;
    message: string;
  }[];
  risks: string[];
  testFiles: string[];
  tests: "not-run";
  codeExecution: "not-run";
  installation: "not-performed";
  limitations: string[];
};
export function savedCandidate(output: string, taskId: string) {
  let raw;
  try {
    raw = JSON.parse(output);
  } catch {
    throw new SyncError(400, "This saved artifact is not a code candidate.");
  }
  if (
    !raw ||
    typeof raw !== "object" ||
    raw.schemaVersion !== 1 ||
    raw.parentTaskId !== taskId ||
    typeof raw.sha256 !== "string"
  )
    throw new SyncError(400, "Candidate identity is invalid.");
  let candidate: CodeCandidate;
  try {
    candidate = validateCandidate(raw.candidate);
  } catch {
    throw new SyncError(400, "Candidate files failed structural validation.");
  }
  const hash = createHash("sha256")
    .update(JSON.stringify(candidate))
    .digest("hex");
  if (hash !== raw.sha256)
    throw new SyncError(409, "Candidate hash does not match its contents.");
  return { candidate, hash };
}
const slot = globalThis as typeof globalThis & {
  nexusCandidateCompilerBusy?: boolean;
};
export async function checkCandidate(
  candidate: CodeCandidate,
  signal?: AbortSignal,
): Promise<ValidationReport> {
  validateCandidate(candidate);
  if (slot.nexusCandidateCompilerBusy)
    throw new SyncError(
      429,
      "A candidate is already being checked. Try again when it finishes.",
    );
  signal?.throwIfAborted();
  slot.nexusCandidateCompilerBusy = true;
  try {
    return await new Promise((resolve, reject) => {
      const worker = new Worker(
        path.join(process.cwd(), "scripts/validate-nexus-candidate.mjs"),
        {
          workerData: { appRoot: process.cwd(), candidate },
          resourceLimits: {
            maxOldGenerationSizeMb: 128,
            maxYoungGenerationSizeMb: 16,
            stackSizeMb: 4,
          },
        },
      );
      let settled = false;
      const finish = (error?: Error, value?: ValidationReport) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        void worker.terminate();
        if (error) reject(error);
        else resolve(value!);
      };
      const abort = () =>
        finish(
          new SyncError(
            409,
            "Candidate validation was cancelled; no candidate code was executed.",
          ),
        );
      const timer = setTimeout(
        () =>
          finish(
            new SyncError(
              503,
              "Candidate compiler exceeded its time/resource budget.",
            ),
          ),
        15000,
      );
      signal?.addEventListener("abort", abort, { once: true });
      worker.on("message", (value) => {
        if (
          !value ||
          !["passed", "failed", "not-applicable"].includes(value.typecheck) ||
          value.tests !== "not-run" ||
          value.codeExecution !== "not-run"
        )
          finish(
            new SyncError(
              503,
              "Candidate compiler returned an invalid report.",
            ),
          );
        else finish(undefined, value);
      });
      worker.on("error", () =>
        finish(
          new SyncError(
            503,
            "Candidate compiler failed or exceeded its resource budget.",
          ),
        ),
      );
      worker.on("exit", (code) => {
        if (!settled)
          finish(
            new SyncError(
              503,
              "Candidate compiler stopped before a report was available.",
            ),
          );
      });
      if (signal?.aborted) abort();
    });
  } finally {
    slot.nexusCandidateCompilerBusy = false;
  }
}
