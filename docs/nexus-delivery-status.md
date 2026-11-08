# Nexus delivery status and retained requirements

Updated November 7, 2026. Repository status is distinct from installation on the operator's laptop.

## Working prototype

Holographic Mission Control and venture desks; local device pairing and synchronization; saved business records and estimates; imported document search; local Ollama and voice adapters; optional explicitly configured model routing; Windows launcher. Laptop voice/background startup still needs operator acceptance on the latest launcher version. Existing shared controller access is a trusted-household prototype, not customer or contractor identity management.

## Current implementation increment

The Daily brief tab provides laptop-persisted real tasks, due dates, priorities, completion, timezone and deep-work preferences, plus a manual task-only preview. Local opt-in scheduling now saves a weekday morning snapshot from real tasks and dated industry records, displays it on opening Nexus, and speaks it when an enabled morning conversation starts. See [morning brief behavior](morning-brief.md). Server checks controller access, validates inputs, detects stale revisions and saves atomically. DEMO missions are excluded. The manual task preview is separate from the saved morning snapshot.

Confirmed defaults: Gulf Wing Co-hosting; America/New_York (Cape Coral, daylight-saving aware); weekday 5 a.m. target; protected 8–11 a.m.; Monday–Sunday weekly view; eventual email to the verified connected Google account and Nexus. Deep work includes scoped owner proposals and profitability/capacity reviews; routine inbox, receipts and nonurgent scheduling are admin. No calendar changes execute automatically.

## Local maintenance increment

Opt-in Windows maintenance controls provide fixed connection checks and starting missing installed services. They require local enablement and existing controller authentication. No arbitrary PowerShell, model-invoked execution, remote Codex access, SSH or Tailscale installation is provided. See [setup and limits](laptop-maintenance.md). Actual Windows enablement/startup needs laptop acceptance.

## Durable assistant foundation

A SQLite-backed Foundation workspace now provides real tasks, local-only owner memory, background local planning, policy pauses, restart recovery, evidence-labeled artifacts, backup snapshots and unvalidated development handoffs. This is the first implementation increment of the general assistant architecture, not completed broad computer automation. See [delivery details and acceptance](architecture/nexus-foundation.md).

## Optional coding worker

The Codex candidate-authoring adapter now supports local dedicated sign-in, per-attempt objective sharing, private workspaces, progress, cancellation, candidate validation and interruption fencing. It stays disabled until actual laptop setup. Code/tests are not executed or promoted automatically; customer subscription embedding remains unverified. See [setup and acceptance](architecture/nexus-codex-worker.md).

## Candidate review increment

Foundation checks candidate integrity and TypeScript without executing generated code. Saved reports and owner decisions bind exact task revisions and hashes; restart interrupts unfinished checks. Existing candidates can be rechecked without another provider request. Accepted candidates can now run separately confirmed synchronous utility tests in a limited WebAssembly runtime, without installation or promotion. See [candidate review](architecture/nexus-candidate-review.md).

See [isolated tests and compatibility limits](architecture/nexus-isolated-tests.md). Passing candidate-supplied tests is not independent QA or commercial multi-tenant isolation.

## Independent verification and inactive packages

The USD formatter profile adds 15 separately authored host-side checks, exact contract fingerprints and revision/hash-bound evidence. After preview and owner approval, a verified version can be archived as an inactive package and later revoked. This does not install a live skill, modify project files, merge or deploy code. Other candidates need their own reviewed verification profiles. See [independent verification and staging](architecture/nexus-independent-verification.md).

## Controlled isolated activation

Verified USD archives can now be selected for a manual currency tool through a preview-bound owner approval. Per-workspace bindings, on-demand WebAssembly execution, per-input output checks, revocation and rollback are implemented. Existing estimates and other business behavior are unchanged. No generic live plugin, arbitrary host code or self-updating deployment is enabled. See [activation, rollback and limits](architecture/nexus-utility-activation.md).

## Co-hosting workflow pilot

A marked test lead can now move through intake, versioned estimate acceptance, one scheduled job, submission, rework and a recorded human completion decision. Accepted prices/scope and job provenance are protected server-side; legacy/restored evidence is labeled unverified. Test work is excluded from live summaries. No external outreach, photos, customer/contractor accounts, invoicing or payments are enabled by this increment. See [the operator rehearsal](cohosting-workflow-pilot.md).

## Retained connection priorities

The operator requests Gemini, Copilot, DeepAI, Obsidian, broader laptop-file search/relationship graph and relevant Google Workspace/marketing connectors. This does not cancel the Co-hosting phase. Actual code/configuration status and next setup order are retained in [the connection roadmap](nexus-connections-roadmap.md); unimplemented adapters are not represented as connected.

## Next delivery gates

1. Read-only Google Calendar OAuth is implemented with local token storage, primary-calendar reads and brief aggregation; actual laptop client setup/account authorization is still required. See [Google setup](google-calendar.md). Self-email delivery, a multi-calendar picker and extended brief history remain unfinished. Laptop sleep prevents local execution.
2. Named roles and server-enforced company/customer/assignment isolation before external users.
3. Customer and workforce app workflow, private photo evidence, review/rework and acceptance.
4. Approved service pricing/cost inputs, payment-provider sandbox collection/reconciliation and contractor payables. No live money movement without configured accounts and release policies.
5. Verified lead sources, reviewed outreach and marketing analytics, followed by explicitly bounded automation.
6. Isolated subscription onboarding, billing, recovery, support and market pilot.

All service-business requirements remain in [the operating blueprint](nexus-service-business-blueprint.md). Cross-platform customer/employee/contractor requirements are in [the apps specification](nexus-client-contractor-apps.md). Preserve original holographic branding, connected agent activity, mobile/TV/ScreenPad layouts, configurable industries and per-company timezones. Fish Audio stays disabled pending verified API pricing and specific voice commercial rights; existing local speech remains available. No paid services or public deployment added.

Google, email, banking, advertisements and scheduling platforms require actual supported adapters and account authorization. Installed third-party apps or a provider logo do not establish a connection. No product-market demand, autonomous income or commercial launch readiness is claimed by this checklist.

## Morning engagement requirement

The operator additionally requires automatic morning engagement on opening Nexus, or when an enabled voice session first becomes active that morning. Implement these as delivery triggers for the same persisted local-day brief, not competing generators. Persist per-user/device acknowledgement and spoken-delivery state, prevent repeated greetings on reload/reconnect, and provide replay/mute controls. Show stale, partial, late or unavailable source data explicitly. Browser speech requires permission and may require a user gesture; no promise of detecting voice while the browser is closed. Local opening and morning conversation-start triggers now exist; Google calendar and email delivery remain outstanding.

## Selected-folder search pilot

Read-only Obsidian and selected business folders can be configured through a local Windows picker and searched in Connections or Ask Nexus. Refresh/removal, source previews, content-hash freshness checks, excluded paths and partial-index status are implemented. Shared controllers have access; display-only devices do not. This does not add whole-laptop access, a relationship graph, or Google Drive/Docs/Sheets authorization. See [setup and limits](local-file-search.md). Native Windows acceptance is the next delivery gate.
