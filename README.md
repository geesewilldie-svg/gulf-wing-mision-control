# Gulf Wing Mission Control

An original, futuristic command workspace built with Next.js App Router, TypeScript, Tailwind CSS, and Lucide icons. General command-dashboard concepts are the inspiration; no proprietary Agentic OS code or assets are used.

**Everything is DEMO.** GPT, Claude, Hermes, and Codex nodes are interface simulations. There are no model calls, connected accounts, telemetry services, actual charges, or API keys. Demo missions, task statuses, activity, selected venture/agent, and panel layouts are saved locally in this browser. No paid services are required.

## Windows local setup

Install Node.js 24 LTS and Git for Windows. In PowerShell:

```powershell
git clone https://github.com/geesewilldie-svg/gulf-wing-mision-control.git
cd gulf-wing-mision-control
# To review the saved-workspaces feature before it merges:
git checkout feat/saved-demo-workspaces
npm ci
npm run dev
```

Open the development server on port 3000 in your browser. Stop with Ctrl+C. No environment file is needed. The server binds to all interfaces for cloud compatibility; use your local firewall as appropriate.

## Interface

- Select any of four network nodes, then assign a demo mission.
- Create a mission with a title and agent; tasks are scoped to the selected venture.
- Use each task's arrow to cycle Queued → In progress → Complete → Queued.
- Switch Holding Company, Co-hosting, Aviation, Security Operations, and Future Ventures from navigation. Future Ventures starts empty.
- Drag a panel's move control or focus it and use arrow keys (16px steps). Dragging is bounded to 160px from its original position.
- Resize desktop panels from their bottom-right corner. Minimize to the dock, maximize, or restore panels. Mobile uses stacked panels with minimize/maximize controls.
- Simulate an agent event to update the activity feed. Model cost and token figures are fixed illustrative data.
- Controls support keyboard focus, the mission dialog traps focus and closes with Escape, status changes have a live announcement, and reduced-motion preferences are respected.

## Holographic command core

The command dashboard uses an original cinematic holographic direction inspired by the supplied particle-core, galaxy, and relationship-graph references. The central visualization is rendered live in Canvas; no film assets, copied source code, external images, model calls, or additional services are used.

- **Core**, **Galaxy**, and **Graph** switch between a rotating particle sphere, a spiral particle field, and a connected relationship map. These are illustrative views, not real stored memories or verified relationships.
- Select GPT, Claude, Hermes, or Codex from the glowing constellation nodes. The agent uplink panel shows its role and actual local demo mission count; **Assign demo mission** opens the existing mission flow with that agent selected.
- Drag the visualization horizontally, or focus it and use arrow keys, to rotate. Mobile vertical swipes remain available for page scrolling.
- Pause/resume motion, reset the viewing angle, or expand the hologram. Expanded mode supports keyboard focus containment, Escape to close, and focus restoration.
- Reduced-motion preferences render a static visualization automatically. A visible fallback preserves agent controls if Canvas cannot initialize. Animation is capped near 30fps, uses a capped pixel ratio, and suspends drawing while the document is hidden.
- The hologram's view mode, angle, and pause state are temporary display controls. Saved missions and workspace panel layouts retain their existing persistence behavior.

## Saved workspaces and reset

In browser-only mode, the dashboard automatically saves demo missions (up to 2,000), statuses, the latest 12 activity events, selected venture/agent, and each panel's position, size, minimized state, and maximized state in `localStorage`. Minimized panels retain their geometry. Desktop positions and sizes are retained while mobile uses a stacked layout. Only one panel is maximized at a time.

**Reset demo** asks for confirmation, then restores all demo defaults, including missions and layouts. Cancel leaves your workspace intact. Reset only changes this app's `gulf-wing.demo-workspace.v1` storage entry; other browser data is untouched.

In browser-only mode, storage is local to the browser profile and site origin (including the port), with no cloud sync or backup. Paired mode uses the laptop's disk-backed workspace described below and preserves this separate local copy. Clearing site data removes the saved workspace. Windows and tabs in the same browser profile and origin receive saved updates automatically. Dedicated presentation windows are read-only consumers of saved data; exploring an agent there only changes that display. Simultaneous edits in multiple controller tabs still use last-save-wins behavior; use one primary controller for reliable editing. Do not put sensitive or production data into this demo.

Saved data is versioned and validated before loading. Malformed or unsupported data is replaced with demo defaults with a visible warning. Out-of-range panel geometry is constrained to supported bounds. If browser storage is blocked or full, the dashboard remains usable and warns that changes will only last until refresh. No save-success claim is shown after a storage failure.

## Multiple monitors, phones, and LG TVs

Open **Screens & TV** on the dashboard. Choose a mission overview, holographic core, mission board, or activity display. Each **Open display** button opens a named independent window; **Open here** is the fallback if pop-ups are blocked. Allow pop-ups only for this app if needed.

### Windows with several monitors

1. Connect the monitors or TV through HDMI, DisplayPort, or your supported dock.
2. Press **Win+P → Extend** in Windows. On an ASUS VivoBook with ScreenPad, Windows may expose the ScreenPad as another display; use Windows Display settings and ASUS ScreenXpert to position it if supported by your exact model.
3. Open the desired display views, move each window onto its monitor, and choose **Fullscreen**. Escape normally exits browser fullscreen. A complete overview and dedicated screen views use larger presentation typography, including layouts checked at 3840 × 2160.
4. Keep the original dashboard as your controller. Changes to demo missions, statuses, activity, and the selected venture appear in presentation windows in the **same browser profile and site origin**, without refreshing. Display modes have no mission-editing controls and do not overwrite saved workspace data.

### Phone or computer to an LG OLED TV

- **HDMI** from a computer (or a compatible phone adapter) is the most predictable option. Use mirroring or extended desktop as appropriate.
- **Android:** Use the phone's supported Screen Cast/Smart View/wireless-display option only if it is compatible with the TV or a connected receiver. Chromecast/Google Cast support varies by LG model and receiver; an ordinary web page cannot guarantee it.
- **Desktop Chrome/Edge:** Their browser/OS casting or wireless display controls can mirror a screen to a compatible receiver. Availability and menu names vary.
- Open the desired presentation view before mirroring. Fullscreen is offered when the browser supports it; unsupported or denied requests show a useful fallback message. The app pairs browsers to the laptop workspace; TV discovery and casting still use Samsung/Windows device controls rather than a built-in Cast sender.

Screen mirroring shows the same phone session on the TV. For independent phone controls and TV content, pair both browsers to the laptop-hosted workspace as described below. No Apple hardware or software is needed. LG webOS browser compatibility is not verified; the recommended arrangement is a Windows browser on the laptop, HDMI to the LG OLED65A1PUA, and the Galaxy S25 Ultra as a separate Wi-Fi controller.

## Android / Windows cross-device synchronization

### Set up your ASUS Windows laptop as the host

From the repository in PowerShell, after installing Node.js 24 and dependencies:

```powershell
npm ci
npm run sync:setup
npm run build
npm run start
```

The setup command prints a private pairing code once **in your laptop's terminal**. Keep it there; do not paste it into chat, GitHub, screenshots, or public URLs. The server stores only its SHA-256 hash plus a signing secret in `.gulf-wing/sync-config.json`; the shared demo workspace is saved in `.gulf-wing/workspace.json`. This entire directory is ignored by Git and is not served as public content. Keep one Node server running against this directory; multi-process or hosted/serverless storage is outside this implementation.

1. Connect the Windows laptop and Samsung Galaxy phone to the same trusted private Wi-Fi. Keep the laptop awake while using shared screens.
2. Run `ipconfig` on Windows and find the Wi-Fi adapter's **IPv4 Address** (usually `192.168.x.x` or `10.x.x.x`). Open `http://YOUR-LAPTOP-IP:3000` in Chrome/Edge on the laptop and Chrome/Samsung Internet on the phone. Use your actual private IP. This is a LAN address, not a public deployment.
3. If Windows Firewall asks, allow Node.js only on your **Private** network. Do not enable router port forwarding or expose this HTTP demo on the public Internet. HTTP pairing/data is not encrypted on the LAN; use a trusted network and demo data. HTTPS and production identity are required before untrusted-network use.
4. On the laptop and phone dashboard, expand **Connect devices**, enter the pairing code, then choose **Pair and join**. Both use the same laptop workspace. Browser-only data is preserved separately.
5. To migrate existing local missions, pair the laptop first and choose **Publish this browser's local workspace**. Confirm the replacement; all paired screens receive it. Joining alone does not overwrite the host's current workspace.
6. For a TV or extra monitor, open a presentation route through **Screens & TV**. On another browser/device, pair from that presentation page using **Pair display**; its session cannot write to the server. On the Windows laptop, put the presentation window on the HDMI-connected LG screen and choose Fullscreen. The Android phone can then edit missions while that screen shows independent content.

If a phone cannot open the address, check that both devices are on the same non-guest Wi-Fi, Windows classifies it as Private, the Node server is running, and the laptop is awake. Router guest-network isolation can block device-to-device connections. Do not change public-network firewall rules or forward ports to work around this.

Sessions last 24 hours, are signed, and use HttpOnly/SameSite=Strict cookies (Secure cookies when served over HTTPS). A display-only session is denied write access by the API, not just the UI. The pairing code grants trusted access, so give it only to your own devices. Disconnect clears this browser's session. To revoke all sessions or recover a lost code:

```powershell
npm run sync:setup -- --rotate
```

This prints a new code, invalidates old sessions, and retains shared workspace data. Use the displayed **Re-pair this device** form after an expired/reset session to retain unsent edits. If there are no unsent edits, disconnecting and pairing again also works. Restarting the host retains saved state on disk; the laptop must keep the `.gulf-wing` directory. Back it up privately if the demo workspace matters.

### Sync behavior and recovery

- Paired devices poll the local host approximately every 1.5 seconds. Missions, statuses, selected venture/agent, activity, and panel layouts share one versioned workspace. Hologram viewing angle/mode stays local to each screen.
- Offline edits remain visible and retry while the tab stays open. Unsent edits are cached in that tab's `sessionStorage` so they can resume after reload. Closing the tab can remove unsent edits; a storage-failure warning explains when even reload recovery is unavailable. Wait for **Synced with laptop** before closing an editing device.
- If the host is unreachable during initial connection, the browser-only workspace remains usable. Restore the host, reload, or use **Check laptop connection** to reconnect. Pending shared edits are kept separate from local-only edits.
- Concurrent saves use optimistic revision checks. A conflict retains your device's edits and asks you to use the laptop's latest version or explicitly keep this device's version. Replacing the shared version requires confirmation; another concurrent change triggers another conflict rather than being silently overwritten. This is whole-workspace conflict resolution, not per-task merging.
- Reset in shared mode explicitly confirms that the reset affects every paired device. Disconnect returns to the separately preserved browser-only workspace.
- Without pairing, same-browser pop-outs retain their previous local synchronization. No cloud service, subscription, external API key, automatic TV discovery, or public deployment is added.

All agents and model costs remain **DEMO**. Laptop storage and device synchronization are real local infrastructure; they do not execute model calls. Physical S25 Ultra/LG/ASUS connectivity must be checked on your hardware. Automated tests use isolated desktop and Android browser contexts, not actual phones or TVs.

The cinematic design references supplied for this phase are recorded in [docs/design/references](docs/design/references/README.md). They guide the original segmented cyan HUD and multi-display composition; the application does not embed film screenshots or source branding.

## Validation

```powershell
npm run typecheck
npm run build
npx playwright install chromium
npm test
```

Browser tests start an isolated production server automatically, so build first and keep port 3000 free. Test pairing files use a disposable OS temporary directory, never the operator's `.gulf-wing` directory. The mobile project emulates Android Chromium; the shared-host suite runs once using independent Android and desktop browser profiles. They cover desktop/mobile mission creation, selected agents, task status, venture isolation, feed events, minimized/maximized panels, desktop movement/resizing, dialog validation, and horizontal overflow. Saved-workspace coverage also checks refresh persistence, venture isolation, panel geometry and mobile reflow, confirmed/cancelled reset, unrelated storage preservation, invalid saved data, and blocked/full browser storage. On Linux machines with preinstalled Chromium, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable path to avoid downloading a browser. `npm run start` serves a completed production build.

## GitHub Actions checks

The `Mission Control checks` workflow runs on pull requests targeting `main`, pushes to `main`, and manual runs from the repository's **Actions** tab. Its **Build, types, and browser tests** job installs the locked dependencies on Node.js 24, builds the app, checks TypeScript, installs Chromium, and runs both desktop and mobile tests. It has read-only repository permissions and requires no API keys or paid services. GitHub-hosted runner usage is subject to your account's included allowance.

After opening or updating a PR, look at its **Checks** tab or the repository's **Actions** tab. A green check means the job passed; a red check links to the failing step. Browser failures upload a report and trace under the run's **Artifacts** section for seven days. These artifacts can contain demo task content entered by tests.

The workflow does not deploy, merge, create PRs, or perform AI code review. To make a green check mandatory before merging, a repository administrator can add **Build, types, and browser tests** as a required status check in the branch protection/ruleset settings for `main` after its first run. This file does not change repository settings automatically.

## Structure

- `app/`: App Router shell, metadata, visual system, responsive styles.
- `components/dashboard.tsx`: interactive demo workspace.
- `components/workspace-panel.tsx`: reusable window controls.
- `components/holographic-core.tsx`: original interactive Canvas visualization and accessible agent controls.
- `components/screen-controls.tsx` and `components/presentation.tsx`: display launcher and responsive presentation screens.
- `app/display/`: presentation route, with `?view=overview|core|missions|activity`.
- `lib/demo.ts`: typed, explicitly simulated data.
- `lib/workspace.ts`: versioned workspace schema, defaults, and saved-data validation.
- `hooks/use-workspace.ts` and `components/workspace-provider.tsx`: local/shared mode, device connection, retries, and conflict resolution.
- `hooks/use-local-workspace.ts`: browser-only persistence and same-browser updates.
- `lib/server/sync-store.ts` and `app/api/sync/`: local pairing, signed sessions, validation, revision checks, and atomic disk storage.
- `scripts/sync-setup.mjs`: private host pairing setup and rotation.
- `tests/`: Playwright functional coverage.

## Roadmap for real integrations

1. Define backend contracts, persistent task/event storage, authentication, workspace membership, and role-based authorization.
2. Add server-side provider adapters with secure secret storage, explicit opt-in, request limits, cancellation, and audit logs. Never ship keys to the browser.
3. Replace simulated events with authenticated streams; add job queues, retries, approval gates, and provider failure states.
4. Import verified token usage and provider pricing, enforce budgets, and reconcile estimates against invoices.
5. Connect each venture to authorized systems through narrowly scoped adapters; validate permissions and data retention before enabling automation.
6. Add production identity, HTTPS provisioning, per-task conflict merging, per-display saved layouts, internet-safe remote access, full accessibility audits, and physical-device validation as separate work.

No public deployment or live integration is included.

### ASUS ScreenPad companion console

In **Screens & TV**, choose **Open ScreenPad** (or visit `/screenpad`). This is a
compact companion console with the same holographic Core, Galaxy, and terrain
Graph modes, venture selection, agent selection, and mission status controls.
It shares the main dashboard’s workspace in the same browser profile and site
address. Other devices require the existing laptop pairing flow; display-only
sessions cannot edit missions.

On supported ASUS models, enable ScreenPad display mode in **ScreenXpert**, then
use **Windows Settings → System → Display → Extend these displays**. Move the
companion window to the ScreenPad and choose Fullscreen (or F11). The app cannot
install ASUS drivers, enable a physical display, or verify ScreenPad compatibility
remotely. Confirm the exact laptop model and installed ASUS utilities locally.
Scroll remains available at smaller resolutions or enlarged Windows text sizes.

Graph mode is an original procedural signal terrain inspired by the supplied HUD
and wireframe references. Four labeled agent peaks react to agent selection;
height and color are illustrative DEMO values, not measured model performance.
Drag or use arrow keys to rotate, reset the view, pause motion, or expand it.

## Nexus business and voice foundation

Open **Open Nexus** from the dashboard or visit `/nexus`. Pair as a controller
using the existing Connect devices panel. Nexus offers one question box (Auto by
default), source-referenced private document search, optional local model answers,
voice controls, Co-hosting operating records and draft estimates, and proposed
marketing allocations. The original dashboard mission/agent simulation stays DEMO.
Business records are separate real user-entered planning records, not automatically
created customer contracts, bookings, invoices, or accounting entries.

### Private business knowledge and Obsidian

Import the private JSON pack prepared from the uploaded plans through **Ask Nexus
→ Import business plans or Obsidian knowledge**. It contains PDF page text and
cached spreadsheet values, with source/page/sheet references. Workbook values are
forecasts; import does not recalculate formulas or certify accounting results.
The pack is handed off separately and is **not committed to this repository**.

A single `.md` or `.txt` note can be imported through the same control. To import
an Obsidian vault snapshot from your Windows laptop:

```powershell
npm.cmd run knowledge:import -- "C:\Users\YOUR-NAME\Documents\YourVault"
```

This reads visible Markdown files, skips hidden directories and symlinks, and
**replaces** the knowledge index. It never edits source notes. Import is bounded
to 1,000 sections / 2 MB. Curate large vaults first. A live watcher, Obsidian plugin,
embeddings/vector search and automatic multi-source incremental sync are not
implemented. Imported document text is evidence, not executable instructions.

The private index, operating records, estimates and change history live under
`.gulf-wing/` (or `GW_SYNC_DATA_DIR`), excluded from Git and public assets. Back up
this folder securely while the host is stopped. Local files are not encrypted by
this app; use Windows device encryption, access controls and secure backups.
All paired display sessions can read private data; this is a single trusted
operator environment, not production multi-company authorization. Keep using a
trusted private LAN; existing HTTP pairing/data remains unencrypted in transit.

### Auto and optional local model

Auto uses an explicitly configured laptop Ollama model, otherwise it retrieves
source excerpts without pretending to generate an AI answer. No question is sent
to an external provider. To enable generation after choosing/installing a model
suited to your hardware, set `GW_NEXUS_MODEL` to its exact `ollama list` name in
`.env.local`, then restart the app (rebuild if changing build-time settings).
Ollama must be running on 127.0.0.1:11434. The model has no tools, billing access,
email-sending ability or permission to execute document instructions. One model
request runs at a time, with a 90-second timeout and a bounded response length.
Answers show the engine and retrieved evidence; citations require human review.
Conversation history/memory and routing across external providers are future work.

ChatGPT, Claude, Gemini, both Copilots, Codex, Hermes, OpenClaw, Google Workspace,
Meta Ads, Google Ads and LinkedIn appear in Connections as **Not connected**.
These are setup requirements, not functional external adapters. Accounts, supported
APIs, permissions, entitlement, quotas and cost approvals must be resolved before
implementation. A chat subscription is not assumed to include API access.

### Co-hosting and marketing

Co-hosting supports saved Lead / Property / Job records, status changes and draft
cost-plus-margin estimates. Direct cost = hours × wage × (1 + burden percentage)
+ other direct costs; draft price = cost / (1 − gross margin). It is not markup.
Taxes, scope-specific overhead, licensing, travel, legal terms and acceptance need
review before issuing a quote. No quote is sent from this app. The supplied plan's
unlicensed scope excludes rental advertising, rates, reservations, rent collection
and security deposits. These functions are not activated by this implementation.

Marketing stores proposed total/channel budget allocations; channel totals cannot
exceed the proposed total. The $500 starting total is a planning assumption, not a
spend authorization. No platform is connected, no metrics are fabricated, and no
ads or money are moved. Changes have a local server timestamp history and revision
checks; conflicts require reloading before another save. This history is not a
production identity-linked or tamper-proof audit system. CRM automation, campaign
analytics, approval workflows, accounting and property-management integrations
remain later implementation work.

### Voice

Nexus can speak using browser/device voices immediately where supported. Select a
voice and use Speak voice preview / Speak answer / Stop speech. Device voices vary
and may use network services; this is not guaranteed offline TTS or a cloned voice.
For optional genuinely local Whisper/Piper, see [Windows voice setup](scripts/voice/README.md).
No paid voice service, model, wake-word listener or external API key is installed.
Microphone capture on the phone requires future HTTPS setup; laptop localhost can
use push-to-talk after the optional worker is configured.

### Product roadmap

This is a single-host business foundation. Before resale: separate tenants and
entity permissions, production identities, MFA, encrypted transport/backups,
reviewed connector scopes, consent and spend approvals, robust financial records,
recoverability testing, usage/cost budgets and commercial license review. The
holding-company model must separate entity actuals from workbook forecasts and
conditional expansion funding. No public deployment is included.

Additional Nexus checks after `npm run build` and Playwright browser installation:

```powershell
npm.cmd run test:nexus-runtime
py scripts/voice/test_worker.py
```

The Node check creates disposable storage and synthetic services on loopback ports
11434, 8766 and 3033; they must be free. It refuses to replace existing services.
It does not use real models, business documents or paid APIs. Browser screenshots
are written under ignored `test-results/`. Python protocol tests need no optional
model dependencies. Audio quality/latency and Windows device behavior still need
local validation. The optional Python dependencies are separate from the npm audit.
