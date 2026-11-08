# Google accounts, Drive, Docs and Sheets

This increment adds up to four Google accounts, combined read-only Calendar retrieval, and manually selected Drive-file snapshots for search. It preserves the verified first Calendar connection. No new live account is authorized by installing this code; Google consent on the laptop is required.

## What is connected

- Each connected Calendar account supplies the configured calendar IDs (`primary` by default). Shared invitation occurrences with the same iCalUID/start time are counted once. Failures identify missing-account coverage; they do not mean an empty calendar or an all-clear for conflicts.
- Google Drive read access is a separate OAuth permission. Its official description is **See and download all your Google Drive files**. Nexus restricts indexing to explicitly selected files, but this is a broad account-level provider grant, not Google's per-file `drive.file` grant.
- Google Docs are exported as plain text; Google Sheets are exported as XLSX and read with the existing multi-sheet workbook parser. This version uses the **Drive API export interface**, not Docs/Sheets editing APIs. Workbook formulas are not recalculated locally; formatting, comments and revision history are not preserved as a full document representation.
- Readable Drive PDFs, plain text, Markdown and XLSX are also supported. Folders, shortcuts, slides, DOCX, images, OCR and arbitrary URLs are not accepted as file sources. Scanned PDFs need OCR.
- Gmail inbox/send, Calendar edits, Drive writes/deletes, Contacts, Tasks, Forms, Ads, Analytics and other Google products are still separate unfinished integrations. An email address in account status proves verified identity, not Gmail inbox access.

## Laptop setup after installing the update

1. Keep the existing private Google OAuth web-client setup and exact localhost callback. No new client JSON is needed for an already configured laptop.
2. In the same Google Cloud project, enable **Google Drive API** in APIs & Services → Library. This export-based increment does not require separate Docs/Sheets API enablement. Review the current project quotas, OAuth policy and any billing prompt rather than assuming unlimited/free-forever service.
3. Keep the intended Gmail accounts in the OAuth app's External/Testing test-user list. Do not publish the consent app merely to connect a personal laptop. Production distribution has additional requirements below.
4. On **http://localhost:3000/nexus → Connections → Google Calendar**, use **Add Drive access · your-account-email** on the existing account. This requests Drive read access while retaining its Calendar scope. Review Google's actual permissions and choose that exact account; switching to a different identity during a targeted upgrade is rejected without replacing the existing connection.
5. To add the second account, use **Connect Calendar and Drive account**, or **Add another Google Calendar** for calendar-only access. Choose the other Google identity. Connecting a different identity appends it rather than replacing the first; reconnecting an existing identity must retain previously granted permissions. Up to four identities are stored.
6. After Google returns, open Connections. Under **Google Drive, Docs and Sheets**, choose the Drive-authorized account, enter part of a filename and press **Find Google files**. Browsing lists at most 25 supported files, newest first; use a narrower name search if results are partial. It does not index every Drive file.
7. Click **Select for Nexus · filename**, then **Refresh selected Drive files**. Check selected/cached counts and warnings. Source links use generated Google URLs for the verified file ID; they open Google separately under the browser's normal account permissions.
8. Search **Search saved Google text**, then ask the same question in Ask Nexus with Knowledge only routing. The local model can use these retrieved excerpts when you select Auto/Local. External model sharing remains per question and off by default.
9. Use **Check calendar access** to test the combined accounts. Add a named test event on the second account and confirm it appears in the count; this native account acceptance has not been performed by the cloud coding workspace.

Connect grants on the laptop's exact localhost URL. Phone/TV/LAN addresses cannot start OAuth, though trusted paired controllers can read authorized snapshots. All trusted controllers share these accounts and data; this is not a tenant-isolated client or contractor portal. Keep real customers/contractors outside the controller role.

## Snapshot behavior and limits

Selected Google files are read only when you request a refresh. Ask Nexus searches saved local snapshots and does not silently download the whole Drive or call Google for every question. Source metadata includes modification and index times; refresh after edits, permission changes, deletion or reconnection. Until refreshed or removed, cached text can represent an earlier Google state; it is not proof of current permission or current document facts.

A refresh replaces the cached set. A selected file that fails, changes during export, exceeds limits or becomes unavailable has its previous text withheld. Partial results and failures are visible. Limits: 20 selected files, 2 MB per export/download, 100 extracted sections per file, 2 million combined extracted characters and the existing PDF/XLSX archive limits. The refresh stops starting further files after 60 seconds; each request also has a 15-second timeout. This is not a hard total deadline for an individual parser call.

Removing a selected file clears the Drive text cache (including remaining selections), then refresh remaining selections. Originals in Google stay unchanged. Disconnecting one identity preserves the other identities but clears all Drive text snapshots and the cached morning brief. Selected file identifiers are retained for possible reconnection; disconnected identities are excluded from searches. Removing/disconnecting does not erase earlier chat answers, downloaded backups, or passages already deliberately shared.

## Credential compatibility and recovery

The existing encrypted `google-tokens.json` is readable without modification. On its first token mutation, an encrypted `google-tokens-v1.backup.json` is retained before migration to an encrypted account collection. Account IDs derive from verified Google email identity; targeted upgrades check that identity. Grants missing requested/existing permissions and unexpected identities do not replace saved credentials. Invalid/corrupt credential data is preserved and fails closed, rather than being silently reset.

Access/refresh tokens remain AES-256-GCM encrypted with the existing pairing-derived key. The key and ciphertext live on the same laptop; this is not an OS vault or production multi-tenant secret store. The private `google-drive-selected.json` holds account/file IDs; `google-drive-index.json` holds extracted private text. These files are in ignored `.gulf-wing` (or `GW_SYNC_DATA_DIR`). Protect the Windows account and private backups. Disconnect removes the legacy encrypted credential backup as well. Local disconnect does not revoke a provider grant; use [Google account connections](https://myaccount.google.com/connections) for provider-side revocation.

OAuth remains fixed-endpoint PKCE, one-use state, exact localhost Host/origin and an HttpOnly callback cookie. Downloads/exports use fixed Google API URLs, disabled redirects, bounded streams and verified file IDs. No browser/model receives OAuth credentials, no document content is executed, and provider error bodies are not reflected into the UI. Account disconnect and snapshot commit share a serialization boundary so an in-flight refresh cannot restore disconnected-account text to search.

## Commercial distribution and sources

Read-only Drive is a broad Google scope. Before selling subscriptions, confirm Google's current OAuth verification requirements, restricted-scope/security-assessment requirements for the deployed data flow, Limited Use obligations, scopes, quotas and applicable charges. The personal testing setup and shared laptop credentials are not a commercial OAuth or tenant-isolation approval. No paid API has been enabled from this workspace.

Protocol reference checked against Google's official Drive v3 discovery schema in the [Google APIs repository](https://github.com/googleapis/google-api-nodejs-client/blob/main/discovery/drive-v3.json): `files.list` and `files.get` accept `drive.readonly`; Workspace documents require `files.export` (Google's export limit is 10 MB; Nexus enforces its smaller 2 MB limit). See [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [files.export](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/export), [Drive usage limits](https://developers.google.com/workspace/drive/api/guides/limits) and [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy) for the requirements governing deployment.

## Validation

The default Turbopack production build and TypeScript check passed. The complete regression suite passed 406 desktop/mobile tests with eight skipped. After the final snapshot-recovery UI correction, all 54 Google/account/Drive/briefing tests passed, including browser recovery from corrupt cached text without reconnecting. Tests cover encrypted legacy preservation, multiple identities, scope/identity binding, token refresh, shared-invitation deduplication, unavailable-account warnings, selected Docs/Sheets/PDF snapshots, source search/links, removal, oversized/changed/failed exports, controller/origin restrictions and disconnect-versus-refresh races. Connection diagnostics (two), launcher checks (five), synthetic local-AI setup and synthetic model/voice runtime checks also passed. No real Google documents, tokens or account consent were used in these tests. Drive API enablement, additional OAuth scopes/accounts and native laptop acceptance remain operator steps.
