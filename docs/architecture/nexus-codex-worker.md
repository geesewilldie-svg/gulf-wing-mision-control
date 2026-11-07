# Nexus Codex candidate-authoring worker

Delivery increment, November 7, 2026. This extends the durable foundation with a real official-CLI adapter. It is candidate authoring, not automatic live application modification or full computer control. Live account setup and Windows acceptance remain required.

## What works

A development task can either produce the existing deterministic handoff, or—with explicit per-attempt consent—send its objective to a locally signed-in Codex CLI. The worker returns a small code candidate under a strict JSON contract. Nexus checks file paths, structure and size, saves an evidence-labeled artifact and keeps the task **waiting** for independent review/testing. A draft skill remains unvalidated. No generated code or tests are executed, and no changes are applied to the live app, promoted, committed, merged or deployed.

Only the task objective and workspace label are supplied. Owner memory, imported business documents, account credentials and existing project files are not included. The objective itself may contain private information: sharing requires an explicit checkbox for that task revision. Without consent, Nexus creates a local handoff and does not contact the worker. Ten-minute, one-use consent is checked again at dispatch and is invalidated by a changed task revision. It is not permission for recurring cloud calls.

## Local Windows setup

After installing and building the reviewed update on the laptop, double-click **Setup-Nexus-Codex.cmd**.

- Installs official `@openai/codex@0.163.0` inside `.gulf-wing/codex-cli` (or the configured private data root), using the existing Node/npm installation. It does not replace global Codex/Cursor tools. Package scripts are disabled; platform binaries are provided through the official optional packages. Internet download and disk space are required.
- Uses a dedicated `codex-worker-home` for the CLI's account state. The official CLI opens its normal ChatGPT sign-in. Confirm the intended account in that browser flow; do not paste passwords, API keys or login codes into chat.
- Enables the worker only after successful sign-in. Failures leave it disabled. The status check requires the pinned 0.163.0 version, compatible flags and a ChatGPT login; other versions fail closed pending adapter review. an API-key login is rejected. The CLI does not expose account email in this status surface, so Nexus does not claim to have verified the email or account entitlement.
- Existing account quota/credits, provider availability and terms apply. Nexus cannot enforce provider-side billing or auto-purchase settings; review those account settings before live use. This setup does not purchase credits or enable API billing. This is not unlimited/free API access. API-key environment fallback is removed, OpenAI/ChatGPT mode is required, and no hidden provider fallback is configured.

Open Nexus → Foundation → **Check coding worker readiness**. Create a Development task. Check **Allow this objective to be sent…** only when ready to use that account's quota, then Queue work. Consent clears for the next task revision/attempt.

Use **Disable-Nexus-Codex.cmd** to revoke future dispatch. Running attempts are asked to stop within the monitor interval; completion is not assumed without process-close evidence. Disabled account files/package data are retained locally for later reuse; disconnect/revocation at the provider is a separate account action. The existing launcher must be running; closing a browser does not stop the coordinator.

The installer expects npm's CLI beside the existing Windows Node installation. If that layout is unavailable, it fails rather than using arbitrary shell text. Setup is not performed by the cloud development workspace on the owner's laptop.

## Process, isolation and validation

The pinned official CLI uses read-only sandbox mode, ephemeral sessions, no interactive approval escalation, ignored user configuration/exec rules, disabled automatic skill instructions/bundled skills, disabled shell/unified execution, plugins, apps, subagents, skill search and web search, and empty MCP configuration. Managed provider/OS requirements are not bypassed. An empty Git repository establishes a separate project boundary; ancestor project instruction loading is disabled with `project_doc_max_bytes=0`. The normal app repository is not copied into it.

The host sends the request through stdin using structured process arguments and a constrained environment. The dedicated CLI handles its credentials; they are not handed to the model by Nexus. Required proxy/CA settings are retained. This is still a trusted CLI running as the local Windows user, not a VM or a proof of strong isolation against a compromised executable. Do not represent it as sufficient tenant isolation for unrelated clients.

Execution has a five-minute coordinator deadline, bounded subprocess output, cancellation checks and a local disable monitor. Progress storage retains event counts/types and generic summaries, not raw provider events, hidden reasoning or stderr. The CLI/provider can have their own diagnostics and retention; ephemeral mode is not a provider-data deletion guarantee. Candidate output is at most 30 KB compact JSON with up to eight text files under `src/`, `tests/` or `docs/`; traversal, hidden components, Windows reserved names, executable extensions and case-insensitive duplicate paths are rejected. Candidates remain JSON text, not materialized executable files. Model test notes are unverified claims; host validation explicitly records code/tests/deployment as **not run**.

Private workspaces live in `development-workspaces/<run-id>/`. The final artifact includes a content hash. Task deletion removes database run/grant references only after active/interrupted work is resolved; it does not erase workspace files, CLI account state, exports or backups. These require separate retention/cleanup handling. Keep secrets out of objectives. Logs/outputs are not guaranteed to redact a secret explicitly included by the owner.

## Durable recovery and migration

SQLite schema 2 adds one-use grants and worker-run records. Existing schema-1 installations receive a consistent pre-migration backup before the additive transaction. Existing tasks/memory/business JSON stores are preserved. An older app refuses the newer schema; reverting requires an intentional compatible restore/migration, not deleting files.

Active runs become **interrupted** after a coordinator restart. New cloud attempts are blocked while an interruption is unresolved. The UI shows the owned launcher PID when known. Check process identity and that the previous worker stopped before acknowledging; PIDs can be reused, so never kill a process solely from an old PID. Owner acknowledgement is labeled as such, not automated termination proof. No interrupted cloud request is automatically replayed.

While the parent is alive, POSIX process groups or Windows taskkill on the owned PID/tree request cancellation. Root process-close evidence is used; unconfirmed termination remains interrupted and blocks retry. Native Windows tree cleanup, browser login and live quota behavior still require acceptance on the actual laptop. A stop request cannot undo quota already consumed or remove a candidate already generated.

## Source verification and tests

Verified November 7, 2026: installed CLI 0.163.0 help/features; official npm package/version and optional platform packages; official OpenAI repository configuration schema for forced ChatGPT login, approval policy, web search and project instruction limits. Sources: [Codex repository](https://github.com/openai/codex), [configuration schema](https://github.com/openai/codex/blob/main/codex-rs/core/config.schema.json), [official package](https://www.npmjs.com/package/@openai/codex/v/0.163.0). No live model invocation or real account token inspection was used for this verification.

Synthetic CLI tests cover consent, environment/prompt isolation, candidate validation, progress, root-process cancellation, recovery fencing, API-key rejection, schema migration and controller/origin boundaries. They do not prove live account entitlement or code quality. Customer subscription embedding, Claude worker integration, independent candidate execution/testing, skill promotion, broad Windows execution and an update supervisor remain future gates.

This pilot shares one worker account across paired Controller access. Verify who holds that role and the provider terms before enabling it; do not expose this account-backed worker to unrelated clients or contractors. Pairing/session revocation removes UI access, not already authorized task contracts: use the dispatch pause or local worker-disable control to stop task processing. A future restore workflow must invalidate old worker grants and reconcile outstanding runs before resuming; restoring an old database is not proof that a previous cloud request never happened.

Local process closure does not establish that provider-side computation or credit accounting stopped; cancellation is best-effort at that boundary. No new billing, credit purchase or API-key fallback is enabled by this setup.

### Validation record — November 7, 2026

Default production build and TypeScript passed. Full desktop/mobile suite: 234 passed, 8 platform-specific skips. The final 16 focused worker checks also passed, including unsupported-version rejection and credential stripping with populated synthetic environment values. Existing connection/launcher checks and synthetic local AI setup/model/voice protocol checks passed. The exact public pinned CLI was installed separately for metadata verification only; no real sign-in/model request, account quota consumption, generated-code execution or native Windows acceptance is claimed.
