# Nexus service-business operating model

Operator requirements recorded 2026-11-06. This is a concrete target workflow and implementation specification, not a statement that these capabilities are already live. Begin with Gulf Wing Co-hosting and preserve the existing original holographic Nexus UI. Later businesses use isolated configurations and permissions, not shared access to one company's accounts or customer data.

## Target outcome

Nexus coordinates the path from a qualified service opportunity through a scoped estimate, customer acceptance, approved contractor assignment, documented work, completion review, invoicing, settlement and reporting. A separate Nexus subscription offering provides the software to other businesses with their own services, branding, pricing, staff/contractors, accounts and bank connections. Revenue and customer demand are not established merely by adding automation.

## Complete operating workflow

1. **Find appropriate prospects:** ingest approved lead sources, public business directories, referrals and inbound forms within the company's service area. Record provenance, permission/contact restrictions, duplicates, last contact and suppression/unsubscribe state. Do not invent contact information or treat every scraped address as permission for outreach.
2. **Prepare and conduct authorized outreach:** create channel-specific drafts grounded in approved services, terms and prices. Start with operator-reviewed messages. Later bounded sending needs an authenticated sender, verified domain, opt-out handling, rate limits and an explicit campaign policy. Track sent/delivered/replied states from provider evidence rather than a model assertion. No purchased list, email account, posting service or message is enabled by this document.
3. **Qualify and onboard the customer:** collect contact, property/site, permitted services, access instructions, scope, schedule, required approvals and customer agreement. Keep sensitive access details visible only to people who need them. Customer acceptance must be recorded from an actual authorized action or signed agreement; a generated draft is not acceptance.
4. **Prepare a defensible estimate:** start with an operator-approved service catalog and cost inputs, scope/condition, expected labor, materials, travel, taxes/fees where applicable and margin floor. Market references need source, location, date and comparability; label them as references, not a guaranteed correct market price. Expire stale references and return unusual/uncertain work for review. The business-plan forecast figures are not an approved public rate card. Record who approved the estimate and the version accepted by the customer.
5. **Recruit and onboard contractors:** intake qualifications, availability, service area, capabilities and required evidence. Nexus can organize information and recommend candidates; a person makes final hiring/engagement decisions. An independent contractor is not a “1099 employee”; actual classification depends on the working relationship and applicable rules. A tax-form label does not determine it. Identity, tax and payment onboarding should use appropriate secure workflows rather than raw SSNs/bank numbers in ordinary notes or prompts.
6. **Offer and assign approved work:** match an already approved contractor to scope, skills, schedule, distance, capacity and compensation terms. Record offer, acceptance/decline, assignment changes and contingency handling. The contractor sees only assigned work and the minimum client/access information needed. An assignment recommendation is not proof that a contractor accepted it. No unlicensed aviation/security service becomes authorized by an assignment in Nexus.
7. **Execute and capture evidence:** a scoped contractor account submits task checklist items, before/after photos for the required service category, relevant notes, exceptions and handover details. Store evidence privately with uploader, server receipt time, job/checklist version and access logs. Limit file sizes/types, validate/re-encode images, handle interrupted uploads and define retention/deletion. Location capture requires a clear purpose and permission. No face recognition or employee personality/suitability inference is needed.
8. **Review completion:** AI may assess whether required views are present, images are usable and visible conditions appear consistent with the checklist. It should give criterion-level findings and uncertainty, not manufacture certainty. Photos, EXIF, timestamps or location alone do not prove work quality or the truth of a claim. Distinguish missing evidence, submitted evidence, AI recommendation, human/client acceptance, rework and dispute. Low-confidence, damage, mismatched scope, reused/irrelevant photos or disputed work require human review. Pilot completion decisions remain human-reviewed.
9. **Invoice and reconcile:** create an invoice only from approved scope/changes. Track actual processor events for payment, refund, dispute and settlement. Estimate, accepted job, invoice, payment and cleared funds are different records and states. A marked checklist or uploaded photo must not fabricate an invoice settlement.
10. **Release eligible compensation:** calculate the contractor's agreed compensation separately from the customer's invoice. During the pilot, an authorized person approves release after accepted work and payment/release-policy checks. Later routine releases can follow explicitly approved policies and processor controls; exceptions/disputes retain human review. Use idempotent requests and verified processor webhooks to prevent duplicate charges/payouts. No financial provider is connected or money moved here.
11. **Deposit and report:** a payment processor settles actual receipts to the company's verified bank account according to its supported schedule, fees and dispute/reserve rules. Nexus reconciles expected versus actual settlement. Other customer businesses should use their own authorized payment accounts; their job revenue is separate from Nexus software subscription revenue.
12. **Improve marketing:** analyze authorized channel metrics, qualified leads, proposal/booking conversion, acquisition cost, contribution margin, repeat work, capacity and service quality. Produce evidence-backed recommendations and drafts first. Changes to campaigns, bids, budgets or messages require configured adapters and approved action limits. Start with zero automatic external spending; a proposed allocation is not executed spend.

## Pilot approval and autonomy boundaries

| Decision/action | Pilot behavior | Requirement for later automation |
| --- | --- | --- |
| Internal briefing or draft | Generate from permitted sources, show provenance | Quality checks, permissions and cost limits |
| Contact a prospect or publish content | Operator reviews/authorizes the campaign/message | Verified sender, permission/opt-out handling, rate limits, approved templates/scope |
| Issue a binding estimate/change order | Operator approves exact scope and version | Approved price/cost rules, bounds, expiry and escalation policy |
| Engage/hire a contractor | Human decision; Nexus assists with intake/recommendations | Human review remains part of hiring decisions |
| Offer approved work | Review assignment and contractor acceptance | Authorized scheduling policy, access scoping and contingency handling |
| Accept photo-based completion | Human/client acceptance with AI recommendations | Validated category criteria, measured review quality, human review for uncertain/disputed cases |
| Charge/refund/release contractor compensation | Authorized human release through a payment provider | Explicit release policy, idempotency, verified events, disputes and accounting controls |
| Increase or redistribute ad spend | Recommendation only | Explicit account authorization and per-channel/overall limits |

These are product requirements and conservative pilot defaults, not configured capabilities or permission to send a real campaign, hire someone, charge a customer or release funds now.

## Required records and state separation

- **Lead/outreach:** source, owner/company, contact provenance, consent/restrictions, suppression, campaign/message version and provider delivery evidence.
- **Customer/site:** agreement, allowed scope, access restrictions, service address, contacts and approved service windows.
- **Pricing evidence:** service category/version, cost inputs, regional market reference/date, margin constraints, approval and expiry.
- **Contractor:** human-approved eligibility, qualified categories, availability, area, agreement and secure onboarding references; do not duplicate tax/bank secrets in general knowledge.
- **Job/assignment:** accepted scope/version, customer/site, contractor, scheduled window, compensation, accepted offer and lifecycle events.
- **Evidence/review:** private image object references, categories/required views, criterion findings, review recommendation, reviewer decision, rework/dispute and customer acceptance.
- **Money:** invoice/payment identifiers, verified webhook records, processor balances/settlements, contractor payable/release, refunds/disputes and reconciliation. Never derive “paid” from an AI answer or an uploaded image.
- **SaaS tenant:** company membership, roles, branding, catalog, policies, credentials and billing subscription. Every record/storage object/query/action is scoped to that company.

Proposed job states: draft → scoped/estimated → customer accepted → offered → contractor accepted → scheduled → in progress → evidence submitted → review required → accepted or rework/disputed → invoiced → paid/settled → contractor release approved → reconciled. This illustrates separate milestones; real jobs may invoice or collect deposits earlier under agreed terms. A boolean Complete is insufficient as the sole financial signal.

## Current code versus missing implementation

Existing: local trusted-controller pairing; lead/property/job records; contact/site/assignee/date fields; manual status/checklists; service catalog; draft estimates with manual acceptance; private backup/restore; document/business search; local voice and model support; explicitly configured model adapters and request activity.

Not implemented: named customer/contractor accounts; tenant isolation; contractor-only mobile portal; job photo uploads; image-quality inference; hiring workflow; actual lead-source/email/ads integrations; live market-price ingestion; e-signatures; invoicing; payment/bank/contractor payout integration; recurring software billing; durable action jobs and their approvals. Do not represent the prototype as autonomously running a company.

## Build order

1. **Finish native voice acceptance** already in progress. Then implement durable jobs, structured approvals and a conservative operating-policy layer. Fix background startup first rather than adding another paid dependency to hide a local fault.
2. **Implement named roles and isolated access before an external contractor portal.** Existing shared Controller access is too broad for contractors or unrelated companies. Design server-enforced per-company and per-assignment access, not just hidden UI controls.
3. **Pilot one service category:** property-turnover cleaning is the proposed first category, subject to operator-approved criteria. Build private before/after evidence upload, checklist review, rework and human acceptance. Use synthetic photos/records initially and keep all payment actions disabled.
4. **Build the estimate policy and price-evidence flow:** obtain actual approved service rates, cost/margin priorities, scope exceptions and dated market sources. Do not reuse forecast prices as operational approval.
5. **Add one verified lead/outreach connector** with draft review, channel limits and suppression. Measure qualified leads and accepted jobs before expanding channels.
6. **Add invoices/processor reconciliation and contractor payables** with explicit policies and human release, then test duplicate webhook, refund/dispute and insufficient-funds paths before considering bounded automatic release.
7. **Add marketing analytics and bounded campaign automation** after account authorization and validated tracking. Do not equate AI recommendations with proven causal results.
8. **Package the reusable subscription platform:** tenant configuration/templates, company-specific accounts/branding, isolation tests, customer privacy/terms, licensing notices, backups/recovery, billing, support and tested upgrades. Keep Nexus subscription charges separate from each tenant's customer receipts and contractor compensation.

## Inputs required before live execution

An approved service/price card and margin priorities; actual service geography and capacity; photo/checklist acceptance criteria and consent/retention policy; approved contractor engagement/classification review; sender and lead-source permissions; account-specific marketing limits; customer terms/payment/refund/payout rules; and chosen providers with verified costs/rights. None may be inferred from an aspirational business plan or a tutorial.

The first paid-product promise should be a measurable end-to-end workflow for a defined service business, not guaranteed clients, income, autonomous hiring or universal business control. Validate demand and operational results with the internal pilot, then a small authorized external pilot.
