# Dedicated Gulf Wing inbox deployment

A minimal deployable inbox host is prepared. It reuses the existing signed receiver and serves only:

- `GET /healthz` for a minimal storage-access health check.
- `POST /api/integrations/gulf-wing/handshake`.
- `POST /api/integrations/gulf-wing/events`.

All other paths, including Controller pairing/workspace routes and the Mission Control UI, return 404. No customer/employee signs in here. This component receives the allowlisted minimal event summaries only; it does not execute agents, control a laptop, collect money or expose the Controller.

## Hosting choices

Use the existing Next.js receiver on the actual Nexus host, or deploy this small inbox component on a dedicated HTTPS service. If the Mission Control operator needs the same local inbox, run it with the intended shared persistent `GW_SYNC_DATA_DIR` on that host. A separate cloud instance does not automatically synchronize its SQLite file into a laptop's Mission Control UI. Its operator can inspect it with the local CLI on that service. Do not claim a connected operating-system UI merely because the component is hosted.

`deploy/render-gulf-wing-receiver.yaml` prepares a paid Render service and persistent disk. Review the service/disk charges and apply it in the Nexus repository's integration branch; this source change alone does not create the service. The Docker image copies only the receiver, its small HTTP host and the local operator inspection script. The dedicated Docker ignore file keeps other workspace/source credentials out of that build context. It installs no npm dependencies and runs as the node user on Node 24.

Configure these in that service's secure environment settings:

- `GULF_WING_COMPANY_ID=gulf-wing-cohosting` (or another agreed company identifier).
- `GULF_WING_INTEGRATION_KEY`: a dedicated random 32-byte key, 64 lowercase hexadecimal characters. Generate/store privately; never reuse AWS keys, app passwords or Controller pairing.
- `GW_SYNC_DATA_DIR=/app/.gulf-wing`: attach a persistent disk here and verify the runtime user can read/write it. Define its backup/retention separately.
- `HOST=0.0.0.0`; Render provides PORT and public HTTPS termination.

After the actual public URL exists, configure the Gulf Wing application host with `NEXUS_URL` equal to that exact HTTPS origin, plus matching `NEXUS_COMPANY_ID` and `NEXUS_INTEGRATION_KEY`. Do not use a repository URL, localhost, signed-in Controller cookie or pairing code.

In the management app, use Integrations → Verify and sync. Confirm a synthetic event in the intended inbox using `node scripts/gulf-wing-inbox.mjs` on the service host. Verify restart durability, failed delivery/retry and key revocation before real business delivery. There is no public HTTP inbox-reading endpoint.

## Executed checks

On November 17, 2026, the existing receiver plus new HTTP-host tests passed: **8 tests**, including missing configuration, closed Controller paths, Origin/signature rejection, signed event acknowledgement, exact duplicate handling and persistent SQLite after a host restart. The actual Gulf Wing sender/receiver contract check also passed locally.

The dedicated image built successfully and accepted a signed synthetic event under a non-root user, with a read-only root filesystem and disposable writable inbox. Controller routes remained unavailable. This is not evidence of a deployed Render service, an actual provider disk/backup, matching hosted secrets, public TLS or visibility in the operator's Mission Control UI. No external job events were sent.
