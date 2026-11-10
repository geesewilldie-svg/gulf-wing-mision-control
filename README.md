# Gulf Wing Mission Control

An original, futuristic command workspace built with Next.js App Router, TypeScript, Tailwind CSS, and Lucide icons. General command-dashboard concepts are the inspiration; no proprietary Agentic OS code or assets are used.

**Demo visuals and real local tools are separate.** The original GPT, Claude, Hermes and Codex dashboard nodes, agent feed and model costs are simulations. Private device pairing, saved business records, imported knowledge and the optional local Nexus voice/Ollama runtime are real laptop-hosted tools. The Nexus agent router supports explicitly configured providers and opt-in public research; external models remain disabled by default. No paid service or credential is supplied. See the setup sections below for storage, permissions and limitations.

## Windows local setup

Install Node.js 24 LTS and Git for Windows. In PowerShell:

```powershell
git clone https://github.com/geesewilldie-svg/gulf-wing-mision-control.git
cd gulf-wing-mision-control
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

The original dashboard agents and model costs remain **DEMO**. Laptop storage and device synchronization are real local infrastructure; Nexus has separate optional local inference and configured-provider routing. Physical S25 Ultra/LG/ASUS connectivity must be checked on your hardware. Automated tests use isolated desktop and Android browser contexts, not actual phones or TVs.

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

No public deployment is included. See the Nexus sections for the implemented local runtime and optional provider adapters.

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

Import original PDF plans and XLSX workbooks through **Ask Nexus → Import business plans or Obsidian knowledge**. The same panel accepts the separately prepared private JSON pack, Markdown and text. Imports retain source/page/sheet references and unrelated existing files. Workbook formula caches are not recalculated or certified; financial projections remain forecasts. Private source documents and the pack are **not committed to this repository**.

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
All paired display sessions can read private data. Trusted controllers share full permissions; named employee accounts and production multi-company authorization are not implemented. Keep using a
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
Hands-free conversation keeps four recent messages in memory for the active session. Persistent conversation history and routing across external providers remain future work.

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

Nexus's preferred local voice is now **Kokoro Isabella (`bf_isabella`), speed 0.95**.
If you already installed and auditioned Kokoro in `.venv-kokoro`, use a spare
PowerShell tab in the repository to run `.\scripts\start-nexus-voice.cmd`.
See the [preferred voice activation instructions](scripts/voice/README.md#preferred-voice-kokoro-isabella).
The app chooses Isabella when the local worker reports ready; Piper/device speech
remain alternatives. Audio output follows Windows sound settings.

### One-command local AI setup on Windows

After installing Ollama for Windows, run this from a spare PowerShell tab in the
repository (leave Mission Control and the voice worker running):

```powershell
npm.cmd run ai:setup
```

The setup finds the per-user Ollama executable even if the current terminal has
an old PATH. If needed it starts a loopback-only Ollama service. It downloads the
small `qwen2.5:1.5b` model if missing and writes the model choice privately to
`.gulf-wing/nexus-config.json`. An already-installed model is reused. A failed
download preserves previous settings. The first download is substantial; actual
response quality and latency need testing on the 8 GB ASUS. No paid API is used.
The script does not install the Ollama application itself, modify firewall rules,
rotate pairing codes, or change existing knowledge/operating records.

Refresh `/nexus` after setup and leave Routing on Auto. A newly saved model choice
is read at runtime; no `.env` editing, rebuild or app restart is needed. An explicit
`GW_NEXUS_MODEL` environment variable still takes precedence. To choose a different
installed/downloadable model, use `npm.cmd run ai:setup -- MODEL-NAME`.

Model requests use a 4,096-token context window, at most 256 generated tokens and
up to 6,000 retrieved source-text characters, with a two-minute keep-alive to reduce
idle memory use. This is a lightweight starting point, not a claim that every
question can be answered accurately or that all provider agents are connected.
The system prompt instructs the model to distinguish forecasts from actuals and
cite available evidence; human review is still necessary. Follow the model's
license before redistributing it or a packaged Nexus product.

`npm run test:nexus-setup` checks setup against a synthetic local Ollama server,
including download/no-download paths, validation and preservation on failure.
Voice processing errors now distinguish an incompatible decoder from a running
worker that failed transcription or speech generation. These errors contain
fixed troubleshooting messages, not transcripts, private paths or tracebacks.

### Hands-free conversation with Nexus

On the laptop, leave Mission Control, Ollama and the Nexus voice worker running.
Open `http://127.0.0.1:3000/nexus`, pair as a controller, expand **Nexus voice · Push to talk**, and select **Start conversation**. Allow microphone access when prompted. Speak normally, then pause for about 1.4 seconds. Nexus transcribes the turn, submits it using the selected routing, speaks the answer with the selected voice (Isabella preferred), and listens again. Auto routing requires your configured local model for generated answers; Knowledge only still returns document-search results.

**Stop conversation / Mute** ends the session immediately. For listening while you work in other apps, use the separately described **Start background assistant** mode below. While listening, you can also say “stop listening.” The microphone is released during transcription, thinking and speech to reduce echo. In normal conversation mode, closing the voice panel, hiding the browser tab, changing Nexus sections, navigating away, or losing controller access stops conversation. Background mode is an explicit alternative that can continue with the panel collapsed or the tab hidden. It stays off on page load unless the per-device automatic-resume setting below has been enabled. This is turn-taking conversation, without wake-word detection or interruption while Nexus speaks. Recent context is limited to four messages in the active session and is not saved as a conversation log. Existing question/answer fields still display the last turn.

A voiced turn has a 30-second limit; silence alone is discarded. Background noise can affect the simple local energy detector, so use a quiet room or headset. Errors stop the loop with a visible message instead of retrying indefinitely. Browsers require localhost or HTTPS for microphone capture; the phone's plain HTTP LAN address supports typed questions but cannot use this microphone mode. No cloud transcription or paid service was added.

Conversation tests use synthetic microphone levels, transcription, model replies and audio playback. They verify the automatic follow-up cycle, microphone release during speech, bounded context, stop cancellation and history validation; they do not measure real microphone recognition quality or voice latency on your laptop.


### Co-hosting daily operations and your wife's devices

See the [day-one Windows setup and operating guide](docs/cohosting-day-one.md) for the complete intake → estimate → accepted job → checklist workflow and morning acceptance check.

This release adds contact/address intake, editing, service catalog, dated/assigned jobs, quality checklists, filtering, estimate status, customer-facing print/PDF copies, one-job conversion from accepted estimates, private backup/restore and shared-device refresh with conflict protection. Existing records are migrated on read without dropping statuses. New workspaces contain service templates but no clients or fake operating activity.

The Ask Nexus importer now reads PDF, XLSX, JSON, Markdown and text directly on the laptop, with bounded uploads and source page/sheet references. It merges unrelated files; same-name reimports replace their uploaded sections. Originals are untouched and source documents are never committed. Cached workbook formulas are not recalculated. Nexus can search saved operating records as well as imported documents; model answers remain subject to source verification.

Run `npm.cmd run ready` from a spare PowerShell tab for a local setup report. In Nexus, **Family / team device access** shows private laptop addresses and explains pairing a phone or Chromebook on the same trusted Wi-Fi. Typed business workflows work there; remote microphone access requires HTTPS. The laptop must remain awake and running. Outside access, HTTPS provisioning, named accounts, live ads, accounting, invoicing and payments are not installed or implied.


### Background personal assistant (Windows)

Click **Start background assistant** once in the Nexus voice panel to keep the conversation going while using another app or a different Nexus section. The existing local model, Whisper transcription and Isabella voice are reused. A compact **Mute Nexus** dock remains on the page when the panel is collapsed. Return to it to mute, say “stop listening” during a listening turn, or use Ctrl+Alt+M while the Nexus window has focus. The shortcut is page-local, not Windows-wide.

This mode uses an audio-thread worklet for speech-boundary monitoring instead of background browser timers. Keep Chrome/Edge open and the laptop awake; closing, refreshing, navigating out of Nexus, losing pairing or a service error stops it. Optional per-device automatic resume is available; no wake word, native Windows microphone service, remote-control powers or new paid service was added. See the [background assistant setup and limits](docs/background-assistant.md), including power/browser settings and validation details.

### Venture operating desks

The Holding Company, Aviation, Security Operations and Future Ventures navigation now opens distinct operating desks with private saved records, responsible owners, dates, status filters, readiness checklists and JSON backup/restore. Aviation includes an original holographic aircraft schematic; Security uses a mission-desk layout. Pair as a Controller, choose **Load venture records**, then create and save a record. These are manual operating/planning tools, separate from the DEMO missions. Saved records are searchable through Nexus. See [venture workspace instructions and limitations](docs/venture-workspaces.md).

### Unified Nexus search and agent router

Nexus now combines imported knowledge and saved business records with optional fresh Obsidian Markdown reads. Auto, explicit model selection, Knowledge only and Compare are available. Local Ollama remains the default. External OpenAI/Claude/Gemini adapters require host configuration, a durable daily request allowance and per-question permission; none are enabled automatically. Optional public research uses separately entered public terms (Wikipedia, or a configured local SearXNG instance). The new request-activity globe reflects actual request events and remains distinct from the original DEMO network. See [setup, privacy, testing and limitations](docs/nexus-agent-router.md).

### Downloaded tools and local connection checks

The Connections tab now includes a separate inventory for Cursor, GrockBot, Manus and OpenClaw, with truthful roles and verification status. No downloaded app is automatically connected. Cursor project guidance and private-data indexing exclusions are included; those exclusions are not a terminal security sandbox. Run `npm.cmd run connections:check` on the laptop to check local router/Ollama/voice readiness without model prompts, provider requests or credential output. See [the onboarding sequence](docs/tools-onboarding.md). Test the diagnostic with `npm run test:connections`.

### One-click Windows startup

Double-click `Start-Nexus.cmd` to start existing Mission Control, Ollama and Nexus Voice in the background and open Nexus. Recognized running services are reused, and unrelated occupied ports are never cleared by killing processes. Optional Desktop/sign-in shortcuts are provided in `scripts/install-nexus-shortcuts.ps1`; nothing is installed at sign-in automatically. Microphone listening remains opt-in. See [Windows launcher setup and limitations](docs/windows-launcher.md). Run `npm run test:launcher` for platform-neutral startup-decision checks; native Windows acceptance remains required.

### Automatic background listening preference

Enable **Automatically resume background listening on this device** in Nexus voice once to request background conversation on future page loads after Controller access, local transcription and granted browser permission are ready. Mute disables this saved preference. A blocked browser shows a visible Resume listening action; browser/OS restrictions cannot be bypassed. The shortcut installer now accepts `-AtSignIn -OpenAtSignIn` to open the laptop browser after service startup. Closed-browser listening and interruption during Nexus's replies are not implemented. See [automatic listening and limits](docs/background-assistant.md).

### Fish Audio and future commercial licensing

Fish Audio remains disabled while current hosted API pricing, service terms and the selected voice's commercial rights are verified. The current laptop is not recommended for local deployment of the documented full Fish models. See the [dated hardware/licensing review](docs/fish-audio-evaluation.md), which distinguishes the self-hosting community license, separately licensed weights, hosted API terms and voice-specific rights. Nexus's subscription/client-product goal requires a complete dependency/model/voice review and production tenant security; those are not implied by a successful local prototype.

### Product direction and market readiness

Nexus is intended to remain an original holographic business command center with potential client/subscription use. [Release priorities and acceptance gates](docs/nexus-market-readiness.md) distinguish the local prototype, native voice acceptance, core Co-hosting workflow, voice/model rights and future production customer security. The supplied YouTube transcript has been reviewed in a [timestamped implementation mapping](docs/video-review-jarvis-workflows.md). Video visuals, promotional offers, subscription entitlements and latency claims have not been independently verified.

### Service-business automation target

The [Nexus operating blueprint](docs/nexus-service-business-blueprint.md) records the requested lead → estimate → approved contractor → job evidence → acceptance → invoice/settlement workflow and reusable company subscriptions. It clearly separates existing local tools from unbuilt connectors, contractor access, image review and money movement. No outreach, hiring, ad spend, payment or subscription activation is performed by the blueprint.

### Daily brief preparation and product delivery status

The **Daily brief** Nexus tab saves real tasks and protected-time preferences on the laptop and provides a manual task-only preview. It excludes DEMO missions. Opt-in local weekday scheduling, automatic display and morning conversation speech are available; see [morning brief setup and limits](docs/morning-brief.md). Google Calendar and scheduled email are not connected. See [delivery status and next gates](docs/nexus-delivery-status.md) and [customer/workforce app requirements](docs/nexus-client-contractor-apps.md).

### Laptop maintenance controls

After installing the reviewed update on Windows, double-click **Enable-Nexus-Maintenance.cmd** once. Nexus → Connections then offers connection checks and starting missing installed services. There is no arbitrary PowerShell execution, remote Codex connection or software download. Use **Disable-Nexus-Maintenance.cmd** to revoke future operations. See [setup and access boundaries](docs/laptop-maintenance.md).

### Google Calendar (read-only)

Nexus now includes an official Google OAuth connection for calendar events used in the morning brief. No account is connected automatically. Create a Google web-client configuration, import it locally with **Setup-Google-Calendar.cmd**, then connect from Nexus → Connections on localhost. See [step-by-step account setup, privacy and limitations](docs/google-calendar.md). No Gmail permissions, email delivery, calendar edits or paid services are enabled.

### Durable Nexus foundation (Node 24+)

The **Foundation** Nexus tab adds SQLite-backed tasks, explicit local-only owner memory, dispatch policy, recovery, planning artifacts and development handoffs. Local planning runs through the configured Ollama model; no new paid provider is activated. Development handoffs remain waiting until an authenticated coding worker is implemented. Existing business JSON stores are preserved. Read [what works, privacy, backup and remaining stages](docs/architecture/nexus-foundation.md) before using it with sensitive information. This is a trusted-controller prototype, not tenant-isolated production software.

### Optional Codex candidate worker

The Foundation can send an explicitly authorized development objective to an official Codex CLI installed privately with **Setup-Nexus-Codex.cmd**. It requires local ChatGPT sign-in and task-specific consent. Candidates are structurally validated but never automatically executed or applied; account quota/terms apply and API-key fallback is disabled. **Disable-Nexus-Codex.cmd** revokes future dispatch. See [setup, migration, interruption handling and limits](docs/architecture/nexus-codex-worker.md).

Foundation includes [candidate validation and review](docs/architecture/nexus-candidate-review.md): local integrity/type checks and revision-bound owner decisions. Static validation does not execute code. Accepted candidates can run separately confirmed [limited utility tests in WebAssembly](docs/architecture/nexus-isolated-tests.md); no code is installed or promoted.

Reviewed USD candidates can now pass [independent contract checks and preview-bound inactive package staging](docs/architecture/nexus-independent-verification.md). Staged packages are private archives, not live application changes.

Foundation now supports [controlled activation and rollback of the isolated USD utility](docs/architecture/nexus-utility-activation.md). Selection is per workspace and affects only the manual currency tool; generated code never becomes a host Node module.

Co-hosting includes a [one-customer test workflow](docs/cohosting-workflow-pilot.md) with exact-version recorded acceptance, rework and human completion review. Provider/Google and broader laptop-file requirements are retained in [the connections roadmap](docs/nexus-connections-roadmap.md).

Selected laptop folders and Obsidian: [read-only setup, refresh, search and source preview](docs/local-file-search.md). Run `Setup-Nexus-Folders.cmd` on the Windows laptop to select a folder, then refresh its index in Nexus Connections. No new Google account is connected by this update.

Google accounts, Drive, Docs and Sheets: [multi-account read-only setup and selected snapshots](docs/google-workspace.md). Existing Calendar credentials are retained; authorize additional scopes/accounts locally.

Gemini free-tier setup: [Gemini Public, isolated from private business context](docs/gemini-public.md). Run `Setup-Nexus-Gemini.cmd` on Windows, enter the key privately, and use the dedicated Gemini Public tab. Billing stays unchanged.
