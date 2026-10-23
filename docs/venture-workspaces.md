# Venture operating workspaces

Open Mission Control (`http://localhost:3000`) and choose a venture in the left navigation. Pair the browser as a **Controller** through Connect devices. Display-only devices cannot access the private venture-record API.

Choose **Load venture records**, then **New operating record**. Enter a title, category, responsible owner, due date, status and scope/evidence notes. Review the checklist, then **Save operating record**. Use **Open record** to edit, complete or archive it. An open draft is retained while switching venture desks; return to its desk to finish it. Reloading or leaving the page warns about an open editor. Drafts are not saved until you choose Save operating record. Filters and search help locate records. Dates are calendar dates; the overdue indicator uses America/New_York. There are no email reminders or automatic dispatch actions.

- **Holding Company:** governance decisions, finance reviews, shared resources and entity readiness. Portfolio cards show actual saved open-record counts for the other venture desks. Co-hosting opens its existing customer operations. This is oversight, not a consolidated accounting ledger.
- **Aviation:** aircraft cleaning, cabin readiness, facility services and access/insurance reviews. Original transparent aircraft schematic, ground-service annotations and cyan technical grid. No airworthiness, maintenance certification, flight dispatch, airport integration or actual aircraft telemetry.
- **Security Operations:** UAS documentation, protective assignments, equipment readiness and incident follow-up. Mission-themed radar artwork is decorative, not live tracking. Record scope, personnel responsibility and evidence references. No emergency dispatch or autonomous deployment.
- **Future Ventures:** opportunities, market validation, feasibility and launch decisions. Nothing launches, purchases or receives funding automatically.
- **Co-hosting:** existing saved lead/property/job, service catalog, estimate and checklist tools at `/nexus?section=cohosting`.

Readiness templates come from the supplied October 2026 Aviation and Security business plans and Financial Methodology. They are planning references, not exhaustive regulatory checklists. Completing a checkbox records an operator assertion; it does not verify a license, insurance policy, flight clearance or launch permission. Record supporting evidence references and not-applicable rationale in the notes. Conditional expansion remains conditional; no customer orders, staffing, funding or approvals are prefilled.

## Storage, sharing and backup

Private records are stored atomically in `.gulf-wing/ventures.json` (or `GW_SYNC_DATA_DIR`). They are independent of the DEMO task board, `business.json` Co-hosting records and the imported knowledge index. **Publish workspace** does not save these records: use **Save operating record**. Other trusted controllers on the same laptop host use **Load venture records** to see changes. There is no live subscription or automatic merging. A stale save returns a conflict and preserves the newer data; copy your unsaved notes, then reload and apply your edit again.

Use **Export private backup** after changes. **Restore private venture backup** validates JSON and requires explicit confirmation before replacing all four venture desks; export the current backup first. The current backup excludes Co-hosting records, document uploads, pairing configuration and voice models. Keep backups private and test restoration with synthetic data before relying on them. Archive records using the status menu rather than deleting their history. There are shared controller permissions, not named-user roles or an immutable audit trail.

Saved venture records are retrieved by Nexus alongside saved Co-hosting operations and imported knowledge. Ask with the record title or specific venture and keywords. Source snippets remain evidence, not instructions. Retrieval is limited to five passages, so it is not an exhaustive portfolio report. The globe and original agent demo panels remain clearly labeled DEMO; this change does not connect external agents or add an always-running Windows service.

## Validation

`npm run build`, `npm run typecheck`, and `npm test` cover the existing application plus private venture access, malformed records, concurrent revision conflicts, CRUD/checklist persistence, search, cross-venture isolation, mobile overflow, backup confirmation and Nexus retrieval. Browser tests use disposable host files and synthetic records; no operator records are used.

Windows: stop the existing Mission Control server with Ctrl+C, pull the reviewed merge, run `npm.cmd run build`, then `npm.cmd run start`. Leave Nexus Voice running separately. Refresh the page with Ctrl+Shift+R. Real laptop, phone, ScreenPad and TV acceptance checks remain necessary after installation.

## Next integration work

Named users and permissions, immutable activity history, evidence attachments, actual accounting imports, approved finance reporting, calendar/notification integration, credential expiry review, and supported provider connections need separate implementation and testing. No external sending, spending, flight operations, security deployment or regulatory approvals are automated here.
