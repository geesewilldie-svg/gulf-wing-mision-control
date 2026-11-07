# Nexus general assistant: foundation and delivery contract

Implementation authorized by the owner November 7, 2026, following an architecture-only design review. Nexus is the single assistant identity; no sample personal data, demonstration booking, or sample monitoring scenario from the supplied master brief is treated as a live instruction.

The [owner-supplied master requirements](nexus-master-requirements.md) are retained with the requested sample scenarios removed; the earlier architecture-only restriction was superseded by explicit implementation authorization.

## Product direction retained

Nexus is an extensible personal and business assistant, not a fixed menu of automations. Application-owned identity, tasks, memory, rules and evidence survive model changes. The existing original holographic interface, venture operations, ScreenPad/TV/mobile views, and future customer/workforce applications remain part of the product. Future subscribing companies require genuine tenant isolation, separate credentials and payment accounts. Nexus software billing stays separate from company job proceeds.

The intended architecture separates planning, deterministic authorization, execution and verification. A durable coordinator owns work; bounded model/coding workers assist. A capability registry routes supported APIs, CLIs, browser and Windows interaction through a broker. Versioned skills encode tested procedures; new/failed methods produce reviewed improvement proposals. Model weights are not retrained by saving memory.

Broad authorized computer access remains a target. Current restrictions are honest delivery boundaries, not a permanent product ceiling. Real Windows/session/account isolation is required before claiming strong enforcement against arbitrary generated code. UAC, user-session state, provider access and finite resources remain actual constraints.

## Delivered foundation increment

- Built-in Node SQLite (Node 24+), transactions, schema versioning, full-text memory search and WAL persistence. No native npm database dependency or paid service.
- Foundation tab for scoped task objectives, planning/development modes, queue/pause/cancel/correct/delete, saved artifacts, explicit owner memory and dispatch policy.
- Background single-host coordinator checks queued work every five seconds; one local inference slot is shared with ordinary local answers. Plans use only the configured local model and bounded imported evidence; no cloud fallback.
- Completion means a planning artifact was saved and read back. It never establishes that an arbitrary requested real-world action happened. Process/model output is not provider confirmation.
- Development requests save structured handoffs linked to their parent task and create unvalidated draft skill records. This original handoff-only increment is now extended by an optional [Codex candidate-authoring adapter](nexus-codex-worker.md). It still does not provide candidate code execution, Claude execution, automatic skill activation or core self-update.
- Active tasks are paused after coordinator restart. Resume is explicit; external operations are not replayed. Corrections, policy pauses and memory changes invalidate stale workers. Cancellation preserves already saved artifacts.
- Personal memory applies across workspace scopes; other scopes are selected explicitly. Records are owner-entered, versioned and local-only. Correction history is retained until the record is deleted. No automatic preference inference or casual chat-to-memory writes.
- Local owner context is added only to local inference. External provider requests do not receive foundation memory; recent conversation history is withheld from external requests to avoid indirectly forwarding local-only memory from prior answers. A user's explicitly submitted query remains governed by that request's existing sharing controls.
- Instructions are model guidance, not execution grants. Mandatory software policy in this increment is the dispatch enable/pause gate and the absence of external execution tools in this coordinator. Instruction text is bounded; oversized instructions are rejected, not silently truncated by the memory store. Model compliance is fallible, especially with small models.
- Consistent SQLite backups can be created from the UI. Snapshot integrity/readability is tested. Automatic backup schedules, UI restore, complete-installation backup and encryption/credential migration are not included.

## Storage and privacy

The new database is `.gulf-wing/nexus-foundation.sqlite` or inside the existing `GW_SYNC_DATA_DIR`. WAL/SHM files belong with the live database; use the provided backup operation or a consistent shutdown/snapshot, not a casual copy of one live SQLite file. Backups are in `foundation-backups/` under that same private directory.

Existing JSON business/venture/brief stores and Google credentials remain authoritative for their current features and are not destructively migrated. Knowledge import continues to work. Future SQLite migrations must first back up, validate, import transactionally and retain rollback capability; a readable export alone is not a full restore plan.

The foundation database is not encrypted in this increment. Protect the Windows account, disk and private backups. Directory/file modes are set on supporting systems; Windows ACL acceptance is still necessary. Scopes are context organization within one shared-controller installation, not tenant or named-user security. Do not use it for unrelated customer/contractor access yet.

Deleting a memory removes active content, its correction history and full-text entries logically. It does not erase copies already present in task artifacts, exported files, model sessions, backups or forensic database pages. Those require separate retention/deletion handling. Deleting a task removes its current content, linked draft skills and task event references. Events avoid raw memory/prompt payloads. Keep secrets out of general memory. External content is never an owner instruction.

UI reads show the latest 200 tasks, 500 memory records and 100 event/skill records. The initial store caps tasks at 1,000 and memory at 500 to prevent unbounded single-host growth. Archive/pagination/retention controls remain future work. A planning artifact stores the latest task output, not immutable versioned artifact history. No universal exactly-once claim is made.

## Use and Windows acceptance

1. Install dependencies with Node 24+ (the operator's Node 26 qualifies), stop the confirmed old Mission Control server, build, then start with the existing launcher. Never rebuild over a running old Next server.
2. Pair as Controller and open Nexus → Foundation. Save owner facts/instructions and a task. Queue a planning task only when the existing local model is ready. Closing the browser does not stop the coordinator while the Node server remains running.
3. Planning output is limited by the existing local model's small context/output budget. Model failures remain visible and resumable. A busy inference slot can require retry; paid fallback is not used.
4. Test objective steering, policy pause and process restart on the laptop. Sleep/sign-out/power-off stop local execution; the coordinator is not an installed Windows service.
5. Use Development handoff to save a work order for later authenticated worker integration. It remains waiting without explicit worker consent/setup; downloading a handoff is not a worker connection. The optional candidate adapter also stays waiting for independent review and testing.

## Dependency-aware work remaining

| Stage | Deliverable and acceptance gate |
| --- | --- |
| General task contracts | Rich acceptance criteria, work-order/artifact history, resource leases, deadlines and structured effect reconciliation beyond local plan generation |
| Coding workers | Version-pinned supported Codex/Claude adapters, account validation, isolated workspaces, progress/cancellation, tests, PR review and resumption of parent work |
| Execution broker | Explicit resource grants, files/processes/browser tools, deterministic policy rechecks, Windows helper and tested user takeover; no unrestricted public shell |
| Personal memory | Temporal provenance, conflict resolution, derived-data deletion, correction propagation across sessions and OS credential vault migration |
| Skills and learning | Manifest packages, holdout tests, validation/promotion/quarantine, regression detection and bounded recursive repair |
| Durable scheduling | General schedules/monitors, missed-run policies, notification budgets and delivery receipts; preserve the existing morning brief behavior |
| Native modalities | Windows invocation/tray, interruptible speech, selected-window capture, accessible automation and hardware/license acceptance for new voices |
| Commercial accounts | Named roles, server-enforced tenant/customer/assignment isolation, customer/workforce evidence workflow and private storage |
| Finance/marketing | Approved pricing, provider sandbox events, reconciliation, human payout release, permissioned outreach, tracking and bounded ad policies |
| Updates/remote operation | Independent supervisor, migration/rollback testing, authenticated outbound device protocol, revocation and optional always-online coordinator |

Provider SDK availability is distinct from subscription entitlement or permission to resell access. New paid usage remains disabled until explicitly budgeted. VoiceStudio/Fish Audio rights and hardware fit remain unverified; the current speech system is retained. Google Calendar still requires actual local account authorization. No public deployment, real outreach, hiring, charges or payouts are authorized by the design alone.

## Verification and owner acceptance

Tests exercise database persistence, stale revision rejection, interrupted work recovery, scoped full-text retrieval, memory correction/deletion, mid-task invalidation, policy enforcement, deterministic handoffs, backup integrity, controller/display separation, cross-origin rejection, and desktop/mobile workflows. Synthetic workers verify orchestration without claiming a live local model/coding worker was tested. Native Windows lifecycle, installed Ollama readiness and actual account integrations need laptop acceptance.

### Validation record — November 7, 2026

Default Turbopack production build and TypeScript passed. Complete desktop/mobile suite: 218 passed, 8 platform-specific skips. Local connection/launcher tests and synthetic AI setup/model/voice protocol checks passed. The expanded suite initially hit the real pairing rate limit; feature fixtures now use signed disposable test sessions while dedicated sync tests retain real pairing coverage. Production rate limits were not weakened. Native Windows acceptance and live model/provider authentication remain unverified here.
