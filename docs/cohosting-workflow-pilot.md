# Co-hosting one-customer workflow pilot

This increment completes a local operator rehearsal from lead through intake, an exact-version recorded estimate acceptance, one job, submission, rework and human completion review. It does not connect lead sources/email, customer/contractor accounts, photo uploads or image analysis, invoices, banking, payouts or marketing spend. Existing paired Controllers are trusted household operators, not external contractors.

## Test walkthrough

Open Nexus → Co-hosting → Load business records. **Create test lead** adds only a clearly marked synthetic prospect using an example.invalid address. Prepare its property from that lead, review the service/site/contact details, then **Prepare estimate** from the property. Enter scope/exclusions and review editable cost/margin inputs. Defaults remain planning inputs, not an approved public rate card or current market quote.

Save the draft, record acceptance using the Test method and explicit scope/price confirmation, choose a job date and internal assignee, then create the job. Start work, complete every agreed checklist item, write a completion summary and submit for review. Record a human reviewer and specific decision note. Request rework if needed, resume, submit a new version and accept only after review. This is an operator-entered internal record, not a remote customer signature or automated evidence assessment.

Test record/estimate identities are immutable and derived records remain test-only. Test work is omitted from live operations counts, Ask Nexus operating sources and morning-brief priorities. Start fresh live records after rehearsal instead of turning synthetic records into customers. A lead source is provenance, not permission to contact someone.

## Integrity and review

Draft estimate term edits increase a server-controlled version. Acceptance records who responded, method/reference, recording operator, server time, accepted version, before-tax cents, customer/site, service name and agreed scope. The price snapshot remains stable if catalog labels or client contacts later change. Accepted/job-linked terms and receipts are locked; changed scope needs a new draft. Status alone without acceptance evidence cannot create new work.

A converted estimate creates one new scheduled job with immutable source estimate/version and copied accepted scope/site. Server validation rejects duplicate conversion, changed provenance, mixed test/live links and stale business revisions. Assignee labels are internal scheduling records, not hiring, offers or contractor acceptance.

Job phases are Scheduled → In progress → Review required → Accepted or Rework. Rework resumes progress and produces a new submission. Submission requires all checklist items and a useful summary; acceptance requires a separate confirmed human decision. Complete is derived from accepted review for new work, not from a checkbox or status toggle. Submitted/accepted work is locked against checklist/scope edits; request rework first. The latest 20 review decisions are retained in each job, with submission version and server time. No photo, physical-quality or financial settlement proof is invented from those fields.

## Existing records and recovery

The business JSON gains additive `workflowVersion: 1` metadata. Existing IDs, statuses, contacts, notes, estimates and schedules are preserved. Legacy Complete jobs are labeled **Legacy unreviewed** rather than assigned fabricated review receipts; reopen them for a documented submission if needed. Legacy Accepted estimates stay historical until exact acceptance is recorded, and cannot create new jobs from status alone.

Before the first workflow-format write, the original file bytes are backed up privately under `business-backups/`. Confirmed restore also backs up the current file, preserves imported history and marks restored acceptance/completion evidence unverified. Restoration does not certify old approvals or move money. Unrelated edits must not silently upgrade restored records. Corrupt/unreadable files remain untouched. Exports retain the existing backup wrapper and include the new fields. Do not downgrade to an older app that would strip new metadata; use compatible recovery with private backups.

All mutations use the existing serialized write queue, revision check and atomic replace. Only paired Controllers can read the private client workspace or write it; display screens cannot retrieve contacts/records. Form phase changes wait for the server, while simple checklist updates can be optimistic and revert on rejection. Stale edits and failed saves retain form input for review.

Native laptop/wife-device rehearsal is still required before real customer data. Customer-facing authentication, contractor evidence, retention/access policies, approved pricing, signed agreements, invoicing and financial integrations remain later gates. The Google/provider/file-search requests are retained separately in [the connections roadmap](nexus-connections-roadmap.md).

## Validation of this delivery

The default Turbopack production build passed. The complete desktop/mobile regression suite passed 352 tests with eight skipped. Focused coverage includes nine workflow/storage tests and four desktop/mobile pilot cases, including rework, human acceptance, reload, display-only access rejection and accepted-price tampering rejection. Connection checks (two), launcher checks (five), synthetic local-AI setup and synthetic desktop/mobile runtime checks also passed. These fixtures do not establish real customer acceptance, physical job quality or working external account connections. The Windows laptop walkthrough remains the next acceptance step.
