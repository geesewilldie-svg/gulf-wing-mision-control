# Reviewed web-link opening on the Windows host

The first browser-launch slice opens one reviewed HTTPS address in the host's normal browser. It does not read pages, click controls, manage tabs, choose/verify browser accounts, submit forms or verify page loading. It reuses the existing launcher's Explorer URL-handoff approach with an absolute Windows executable path and a literal URL argument; no shell command or user-supplied executable is accepted.

## Local setup and use

Run `Enable-Nexus-Link-Opening.cmd` on the Windows laptop once to enable the separate capability. `Disable-Nexus-Link-Opening.cmd` revokes it. Setup changes only `.gulf-wing/link-opening.json`, preserves malformed settings rather than resetting them, and opens no page. It does not reuse or expand maintenance enablement. Existing trusted paired controllers share access; this is not customer identity isolation.

In Auto or Local mode ask “Open on laptop https://example.com” or “Open https://example.com on my laptop”. Nexus displays the hostname and full normalized address. Reviewing/dismissing a proposal does not invoke a browser or contact the website. Choose Open on laptop to approve that specific address. The host must be awake and signed in; a locked/disconnected interactive session may not display the window. Android initiates the action on its paired Windows host, not on Android itself. Your normal browser may use its existing profile/cookies; Nexus neither inspects nor verifies them.

Only absolute HTTPS addresses without embedded credentials, whitespace/control characters or more than 2,000 normalized characters are accepted. File, HTTP, JavaScript, executable and extra command/argument fields are rejected. URL text comes from the current owner request, not extracted documents or model output. The assistant command is local-only even when external sharing is otherwise enabled. The website receives the normal browser navigation only after confirmation; the Node server never fetches the target URL.

## Dispatch and receipts

The API requires same-origin controller authorization and explicit confirmation. Local enablement is checked before claiming and again immediately before dispatch; cancellation is checked before dispatch. Missing/invalid settings cannot enable access. A spawned Explorer process confirms only handoff to Windows, not that a page displayed or loaded. That limitation is part of the result message.

New requests use the existing durable laptop-operation store. A SHA-256 of the normalized URL binds operation arguments to the request ID in the existing event log. Different URLs under the same ID are rejected; completed/pending/expired repeats return their saved receipt without another dispatch. URL text and query values are not stored in receipt/event records. This does not remove the original owner request from the current browser conversation. A fresh request ID with new confirmation is a new operation.

Permission/cancellation failures before dispatch record not-started; an unconfirmed transport failure records unknown. Expired unconfirmed records retain existing unknown/no-auto-retry behavior. Show laptop operations retrieves the receipt. Closing/muting the conversation after approval does not guarantee cancellation, and no browser process is terminated by this capability.

## Evidence and limits

The capability registry now separates reviewed link opening from unbuilt browser/page automation. No database migration or broad desktop grant is added. Linux checks simulate platform/settings and inject the handoff function; they never start a real Windows browser. Native Explorer URL handling, focus/session behavior and the owner's default browser remain acceptance work.

Official-source review, November 23, 2026: Node's [child_process documentation](https://nodejs.org/api/child_process.html) was retrieved and checked for argument-array spawning and shell behavior. Microsoft's [launching applications reference](https://learn.microsoft.com/en-us/windows/win32/shell/launch) was blocked by the network proxy; the [official MicrosoftDocs source](https://raw.githubusercontent.com/MicrosoftDocs/win32/docs/desktop-src/shell/launch.md) was retrieved instead for default association/launch semantics. The exact Explorer handoff is based on the repository's existing `scripts/start-nexus.mjs` implementation; these references are rationale, not native execution evidence or a claim of ShellExecute API integration.

Saved results: ask “Show laptop operations”, then choose View result. Link completion is labelled Handed to Windows; inspect the laptop browser to confirm display. Result unconfirmed requires inspecting the laptop before issuing a new request. Viewing a receipt never opens the link again. Native owner verification on November 23, 2026 confirmed one reviewed example-domain link opened in the Windows browser.
