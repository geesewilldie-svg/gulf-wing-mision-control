# Connect Google Calendar to the local Nexus app

This integration is read-only. It reads event details for the next seven days from the configured calendars (primary by default) on each Calendar-authorized connected account to populate the local morning snapshot. It does not edit calendars, read Gmail, send email, connect banking or activate a paid AI provider. The [Google Workspace increment](google-workspace.md) adds multiple accounts and separately authorized selected Drive/Docs/Sheets snapshots. Your Google account is not connected merely by downloading or building the code.

## One-time Google setup on the laptop

1. Open [Google Cloud Console](https://console.cloud.google.com/) with the Google account you want to use. Create/select a project for Nexus. Do not purchase a service or enable billing for this setup; stop and review if the console requests payment.
2. In the API Library, enable **Google Calendar API** for that project.
3. Open **Google Auth platform** (or APIs & Services → OAuth consent screen). Configure the app name Nexus, your support/contact email and audience. For a personal account use External/Testing and add your own Google email as a test user. Do not select public publishing just to connect your laptop.
4. Create an OAuth client of type **Web application**. Register this exact **Authorized redirect URI**:

   `http://localhost:3000/api/sync/google/callback`

   Do not use the phone LAN address, a wildcard or a redirect under someone else's domain. No JavaScript origin is needed for this server-side flow.
5. Download that web-client JSON to the laptop. Keep it private; do not paste its contents into chat, upload it into Nexus knowledge, share it or commit it to Git.
6. Double-click **Setup-Google-Calendar.cmd** in the project folder. The local file picker imports that downloaded JSON and validates its registered redirect. It saves only the client ID/secret to the ignored `.gulf-wing/google-oauth.json` (or the same `GW_SYNC_DATA_DIR` used by the app).
7. Open **http://localhost:3000/nexus** on the laptop, pair as Controller if needed, then Connections → Google Calendar → Refresh Google status → Connect Google Calendar. Google sign-in must start on localhost, not 127.0.0.1 or a LAN address, because the callback cookie is bound to localhost.
8. Select the intended Google account and approve **read-only calendar events**, plus basic verified email identity. If the app is in Testing, only configured test users can connect. Never bypass an unexpected app identity/redirect or a request for unrelated scopes.
9. Back in Nexus, use **Check calendar access**. It reports the number of items retrieved over the next seven days; zero is valid only after a successful read. Missing permission, expired grants and provider failures produce errors rather than a calendar all-clear.

Google authorization cannot be completed by Codex from the development workspace. No real client credentials or account grants are bundled. The importer requires Windows PowerShell and the already-installed Node app; it does not install an SSH server, add firewall rules or require administrator access.

## Brief behavior and limits

- Primary calendar is the starting selection. Other work/personal calendars are not silently included. The brief only checks calendars in saved `calendars` settings; a calendar picker is not part of this increment.
- The existing weekday 5 a.m. scheduler reads calendar events when creating a snapshot. The laptop must be awake and the server running. Connecting or disconnecting removes the prior cached morning snapshot so the next eligible check can regenerate; previously spoken per-device delivery markers are retained. Ask “read my morning brief” to replay an updated saved snapshot.
- Event titles, attendees and provided descriptions supply meeting/preparation details; descriptions are evidence, never executable instructions. Missing prep uses a clearly labeled suggestion. Cancelled/self-declined events are excluded, all-day exclusive end dates are respected, and transparent/all-day items do not count as timed double bookings.
- Admin classification matches title keywords and may miss or misclassify events. Proposed schedule changes remain suggestions. There is no financial optimization guarantee and no write scope.
- Pagination is capped. Partial results are flagged; account/API failures are unknown availability, not an empty calendar. Quotas, provider availability, Google OAuth policy and any applicable provider costs remain external constraints; this is not an unlimited-use/free-forever promise. See [Calendar usage limits](https://developers.google.com/workspace/calendar/api/guides/quota) and [OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies).
- Google External/Testing refresh tokens with Calendar scopes may expire after seven days. Reconnect if needed. A client-facing subscription product needs production OAuth verification, tenant-specific grants and account isolation before rollout.

## Storage, disconnect and recovery

Client credentials are stored locally, outside Git. Access/refresh tokens are AES-256-GCM encrypted using a key derived from the laptop pairing signing secret. The key and ciphertext ultimately reside on the same machine; this is not an OS credential vault or production multi-tenant secret-management system. Protect the Windows account, folder permissions and private backups. Changing/replacing the pairing signing secret requires reconnecting Google.

OAuth uses PKCE, random single-use state, a ten-minute HttpOnly SameSite=Lax callback cookie and fixed Google endpoints. Callback codes/tokens/provider error bodies are not reflected into the browser response. Controller-only API responses use no-store caching. No browser token storage or model access to OAuth secrets is provided.

**Disconnect account** removes that identity locally while preserving others; **Disconnect all Google accounts** removes every local identity. Both clear pending state, Drive snapshots and the cached morning brief. It does not revoke the grant at Google: also remove Nexus in [Google account connections](https://myaccount.google.com/connections) when you want revocation. Client configuration remains for later reconnecting. Already-downloaded exports/backups are not erased. Existing trusted paired controllers share these local account connections; do not grant that role to customers or contractors.

Tests use synthetic OAuth/token/event responses. A real Google sign-in, the Windows file picker and Google account permissions still need laptop acceptance. Email delivery is a separate unfinished integration.

## Localhost sign-in with the Windows launcher

The launcher binds Next to `0.0.0.0` so other paired devices can reach the app. Next may construct its internal request URL with that bind address even when the browser uses `localhost`. Sign-in-start validation therefore uses the incoming browser `Host`, matched exactly against the fixed `localhost:3000` callback host, plus controller and same-origin checks. Forwarded-host headers do not grant access. The callback URL, PKCE/state checks and cookie binding are unchanged. LAN addresses, `127.0.0.1`, lookalike hosts and other ports must start again from the exact localhost URL.

Validation: reproduced the old HTTP 400 with a synthetic client on the production all-interface server; the fixed default Turbopack build passed. All 28 desktop/mobile calendar, daily-brief and morning-brief tests passed, including the real browser Connect-button path with an intercepted synthetic Google page (no Google account or token exchange). Real account consent and calendar read remain laptop acceptance steps.
