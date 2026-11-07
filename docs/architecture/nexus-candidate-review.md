# Candidate validation and owner review

Foundation now checks saved Codex candidates locally and records owner review against the exact task revision and SHA-256 hash. Existing candidates can use **Validate saved candidate** without another Codex request. New Codex results receive these checks automatically.

The trusted compiler worker parses virtual files using the installed TypeScript compiler in strict, no-emit mode. Its compiler host exposes candidate files and installed TypeScript/Node declaration libraries only. External dependencies are not installed and project configuration/plugins are not loaded. The worker has a 15-second deadline and V8 memory limits. These are compiler resource controls, not a sandbox for executing generated programs. TypeScript and Node declaration development dependencies must remain installed.

Reports identify diagnostics, likely test files, and a limited set of capability imports. Warnings are not exhaustive. A passing type check establishes neither correctness nor security. Tests and generated code are never executed; no files are installed or skills activated. JSON/Markdown-only candidates require manual review and cannot pass the TypeScript acceptance gate.

Read the saved artifact and report, confirm review, then choose **Accept for isolated testing** or **Reject candidate**. Acceptance records readiness for a future isolated test stage. That executor and promotion workflow are not implemented. Acceptance does not queue execution or authorize deployment. Existing independent/manual test evidence is not converted into a machine-verified report.

Only paired controllers can use these operations; same-origin checks apply. Review notes are owner data, not instructions or test evidence. Decisions require current review revision, current task revision, artifact hash, and the latest report. Changed tasks invalidate earlier review. Restart marks unfinished checks interrupted without replay.

SQLite schema 3 adds private review reports and notes. Schema-2 databases receive a private pre-migration backup; schema-1 migration retains its earlier backup. Older application versions refuse a newer database. Task deletion removes its reviews once no check is active; private backups retain prior records. Other business/knowledge stores are unchanged.

## Validation of this change

Six focused candidate-review tests pass, along with TypeScript checking and launcher/connection script checks. This environment could not complete the production build (Turbopack process/port restriction; webpack fallback configuration subprocess failure) or the browser suite. Three existing CLI-fixture tests also report the subprocess unavailable here; three other worker tests pass. These limitations must be resolved in CI or on the laptop before treating this update as release-validated. No live provider request was used for testing.
