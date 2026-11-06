# Nexus customer and workforce apps

Product requirements, November 6, 2026. These are planned capabilities, not live integrations. This extends the [service-business operating model](nexus-service-business-blueprint.md).

## Platform and access

Start with a responsive, installable progressive web app for Android, iOS and Windows using the existing original holographic design. Installation, notifications, background execution and offline support vary by OS/browser and must be tested on actual devices. A PWA does not guarantee continuous background microphone access. Consider native wrappers later only for demonstrated requirements.

Use one maintained application with distinct authenticated workspaces:

| Workspace | Permitted work |
| --- | --- |
| Customer | Request service, provide site/scope details, review and accept versioned estimates, view own jobs, approve or dispute completion, pay own invoices, retrieve receipts |
| Contractor/employee | View accepted assignments, accept/decline offers as appropriate, check requirements, upload before/after evidence and notes, submit completion, see own agreed compensation and payment status |
| Business operator | Configure services and approval rules, approve personnel and assignments, review exceptions/evidence, issue invoices, approve compensation releases, reconcile settlements |
| Nexus platform administrator | Operate software subscriptions and support; no default access to tenant customer records, bank credentials or job proceeds |

Employee and contractor relationships need separate policies. Membership in one company must never grant access to another. Customer access is scoped to their own records; workforce access to their authorized assignments. Enforce permissions in every server query, file download, upload and action, not only the navigation. Shared display/controller pairing in the current prototype is not sufficient for these accounts.

## First complete workflow

1. Customer submits a service request and receives an operator-approved estimate.
2. Customer accepts the exact scope/version; approved personnel accept assignments.
3. Worker records checklist progress and uploads private evidence against required categories.
4. Nexus identifies missing evidence and recommends review outcomes with uncertainty. Human/client acceptance handles the pilot and all disputed or uncertain work.
5. Approved invoice is collected through a verified payment provider. Signed provider events establish payment and settlement states.
6. Compensation becomes eligible under the agreed release policy; an authorized operator approves pilot payouts. Provider confirmations establish payout state.
7. Business receipts settle to that business's verified account. Nexus reports actual receipts, fees, compensation, refunds, reserves and available balances.

Uploaded photos do not by themselves prove completion, establish cleared funds or authorize a payout. Owner distributions must follow the business's accounting and authorized distribution rules; gross customer receipts are not automatically owner income. Nexus software subscriptions have a separate ledger and billing flow from tenant job proceeds.

## Reliability and financial requirements

- Resumable uploads with visible pending/sent/failed states, size/type checks, image re-encoding and private access-controlled storage. Do not promise offline submission until implemented and tested.
- Immutable event history for acceptance, scope changes, review decisions and financial actions. Preserve source evidence and actor identity.
- Durable action queue, idempotency keys, authenticated provider webhooks, duplicate/out-of-order event handling, reconciliation and explicit ambiguous-result handling.
- Hosted payment and identity onboarding; keep raw card data, tax identifiers and bank credentials out of Nexus forms, chat and general knowledge storage.
- Separate invoice, payment, settlement, contractor payable, payout, refund, dispute and owner-distribution records. Never show an AI prediction as completed money movement.
- Configurable company/industry templates, timezone, currency, services, work criteria, roles and policies. Aviation/security templates do not grant operating permissions or licenses.

## Delivery sequence and acceptance

1. Named accounts and server-enforced company/customer/assignment isolation; test cross-company reads, writes, uploads and downloads are denied.
2. Customer request/estimate portal and workforce assignment/evidence portal; test mobile touch layouts, denied permissions, interrupted uploads and rework/dispute paths.
3. Payment-provider sandbox integration; test retries, duplicate webhooks, failed collection, refunds, disputes, insufficient balances and failed payouts. No real money during these tests.
4. Android, iOS and Windows installation and browser acceptance checks, then a small authorized pilot. Existing LAN hosting alone does not provide secure access away from home.
5. Real payment enablement only after provider onboarding, verified costs, operator policies and settlement/reconciliation acceptance. Add subscription billing after tenant isolation is proven.

The separate daily-brief work continues to use real Nexus tasks and company records, with Google Calendar authorization still required. Neither this document nor a planning module enables email, payments, external customer access or a scheduled brief.
