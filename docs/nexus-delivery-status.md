# Nexus delivery status and retained requirements

Updated November 6, 2026. Repository status is distinct from installation on the operator's laptop.

## Working prototype

Holographic Mission Control and venture desks; local device pairing and synchronization; saved business records and estimates; imported document search; local Ollama and voice adapters; optional explicitly configured model routing; Windows launcher. Laptop voice/background startup still needs operator acceptance on the latest launcher version. Existing shared controller access is a trusted-household prototype, not customer or contractor identity management.

## Current implementation increment

The Daily brief tab provides laptop-persisted real tasks, due dates, priorities, completion, timezone and deep-work preferences, plus a manual task-only preview. Local opt-in scheduling now saves a weekday morning snapshot from real tasks and dated industry records, displays it on opening Nexus, and speaks it when an enabled morning conversation starts. See [morning brief behavior](morning-brief.md). Server checks controller access, validates inputs, detects stale revisions and saves atomically. DEMO missions are excluded. The manual task preview is separate from the saved morning snapshot.

Confirmed defaults: Gulf Wing Co-hosting; America/New_York (Cape Coral, daylight-saving aware); weekday 5 a.m. target; protected 8–11 a.m.; Monday–Sunday weekly view; eventual email to the verified connected Google account and Nexus. Deep work includes scoped owner proposals and profitability/capacity reviews; routine inbox, receipts and nonurgent scheduling are admin. No calendar changes execute automatically.

## Next delivery gates

1. Google OAuth read-only calendar access and self-email delivery, securely stored tokens, calendar selection, actual business/job priority aggregation, email-delivery scheduler and extended brief history. Test late startup, duplicates, revoked access, partial calendars and delivery failure. Not connected or scheduled yet. Laptop sleep prevents local execution.
2. Named roles and server-enforced company/customer/assignment isolation before external users.
3. Customer and workforce app workflow, private photo evidence, review/rework and acceptance.
4. Approved service pricing/cost inputs, payment-provider sandbox collection/reconciliation and contractor payables. No live money movement without configured accounts and release policies.
5. Verified lead sources, reviewed outreach and marketing analytics, followed by explicitly bounded automation.
6. Isolated subscription onboarding, billing, recovery, support and market pilot.

All service-business requirements remain in [the operating blueprint](nexus-service-business-blueprint.md). Cross-platform customer/employee/contractor requirements are in [the apps specification](nexus-client-contractor-apps.md). Preserve original holographic branding, connected agent activity, mobile/TV/ScreenPad layouts, configurable industries and per-company timezones. Fish Audio stays disabled pending verified API pricing and specific voice commercial rights; existing local speech remains available. No paid services or public deployment added.

Google, email, banking, advertisements and scheduling platforms require actual supported adapters and account authorization. Installed third-party apps or a provider logo do not establish a connection. No product-market demand, autonomous income or commercial launch readiness is claimed by this checklist.

## Morning engagement requirement

The operator additionally requires automatic morning engagement on opening Nexus, or when an enabled voice session first becomes active that morning. Implement these as delivery triggers for the same persisted local-day brief, not competing generators. Persist per-user/device acknowledgement and spoken-delivery state, prevent repeated greetings on reload/reconnect, and provide replay/mute controls. Show stale, partial, late or unavailable source data explicitly. Browser speech requires permission and may require a user gesture; no promise of detecting voice while the browser is closed. Local opening and morning conversation-start triggers now exist; Google calendar and email delivery remain outstanding.
