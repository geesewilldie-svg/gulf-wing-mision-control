# Gulf Wing operational-event inbox

This branch adds a dedicated server-to-server receiver for the separate Gulf Wing property-service app. It is disabled until configured. It does not use, expose, or change Controller/display pairing, named app accounts, the shared workspace, business-knowledge records, banking, payments or payroll. It accepts a small operational event summary into a separate append-only SQLite inbox for operator review.

## Host configuration

Use Node 24 and persistent local storage. Supply `GULF_WING_COMPANY_ID` (1–120 ASCII letters, digits, underscores or hyphens) and `GULF_WING_INTEGRATION_KEY` (64 lowercase hex characters representing 32 random secret bytes) through the Nexus host's secure environment. Generate the key in a trusted password manager or terminal; enter it directly into host secrets, never chat, source control or browser/mobile configuration. The app sender must use the identical company ID and key. Controller pairing codes are unrelated and must not be reused.

The data directory is `GW_SYNC_DATA_DIR` when configured, otherwise `.gulf-wing` beneath the process working directory. The receiver creates `gulf-wing-integration.sqlite` there; include this database in the host backup plan separately from the service app's authoritative database/photos. Keep the directory private. Persist it across restarts; stateless/serverless filesystems cannot establish durable receipt. SQLite's WAL and busy timeout support short concurrent writes on one host; this is not a multi-host distributed database.

The hosted Gulf Wing app requires an actual internet-reachable HTTPS Nexus origin. A GitHub URL, a laptop's `localhost:3000`, or a LAN-only HTTP address does not provide that connection. Configure approved connectivity, access logs without secrets, request limits and availability before enabling forwarding. TLS termination must preserve the raw request bytes and signature headers. No public hosting or credentials are provisioned by these files.

## Protocol v1

- `POST /api/integrations/gulf-wing/handshake`
- `POST /api/integrations/gulf-wing/events`

Both require JSON, no browser `Origin` header, and a raw body of at most 16 KiB read within 10 seconds. Signatures use HMAC-SHA256 with the **decoded hex key bytes** over `timestamp + '.' + rawBody`. Send Unix seconds in `x-gw-timestamp` and lowercase hex digest in `x-gw-signature`. Timestamps must be within 300 seconds of the receiver's clock. Responses on success use the same signature headers over their exact response bytes; the sender must verify them, not trust a green HTTP status alone. Do not put secrets or job payloads in URLs.

A handshake body contains exactly `version:1`, `companyId`, and `nonce` (32 lowercase hex characters). Its signed response contains exactly `version:1`, `companyId`, the same `nonce`, and `service:'nexus'`. A new unpredictable nonce on each attempt prevents an earlier response from satisfying a later handshake. No database is created by a handshake.

An event body contains exactly `version:1`, `companyId`, `eventId`, `eventType`, `jobId`, and `occurredAt`. IDs follow the company ID character/length constraints. Event types are restricted to `job.assigned`, `job.submitted`, `job.approved`, and `job.rework`. Timestamps are canonical UTC ISO strings with milliseconds, such as `2026-11-14T15:00:00.000Z`. Unknown fields and event types are rejected. No property names/addresses, customer contacts, photos, access instructions, compensation or payment details are accepted.

The signed acknowledgement is exactly `version:1`, `companyId`, `eventId`, `accepted:true`, and `duplicate:boolean`. Receipt and acknowledgement occur only after a durable insert/commit. Re-delivering the same semantic event is safe. Reusing its event ID for a different payload returns 409 and preserves the original. The source's event ID is the reconciliation key; restarting either service does not create another inbox row for that event.

Events remain an immutable history, including out-of-order arrivals. They do not overwrite a current job state or trigger automation, so an older arrival cannot revert an approved job. The service application remains authoritative. An approved event does not authorize a payment or prove cleared funds. The event inbox does not grant customers/workers Nexus access.

## Operator review and recovery

From this repository, with the Nexus host's normal environment loaded, run:

```sh
node scripts/gulf-wing-inbox.mjs
```

The local operator command prints the latest 200 accepted events for the configured company, with receipt times. There is no unauthenticated inbox read endpoint. This is a read command for a trusted local operator, not a mobile/customer API. It does not export or print the integration key.

Never rotate the company ID/key while an ambiguous sender request is unresolved. Coordinate sender and receiver changes and retain source event IDs. A changed company ID selects an isolated inbox namespace. Keep clocks synchronized. After host/database restoration, reconcile accepted event IDs with the sender's durable queue before continuing; duplicates remain safe. Revoke the integration by removing its key from both hosts. Disabling this receiver does not disable Controller sync, and Controller credentials cannot bypass receiver authentication.

## Validation

`node --test scripts/gulf-wing-integration.test.mjs` exercises disabled/invalid configuration, signed nonce acknowledgements, signature/time/company rejection, strict minimal payloads, size/type limits, durable duplicates/conflicts across restart, and out-of-order receipt. Fixtures are temporary and synthetic. `npm run typecheck` validates the new Next route modules. These checks do not establish deployed HTTPS connectivity, host backup schedules or a running cross-project connection.
