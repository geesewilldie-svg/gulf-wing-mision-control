# Gulf Wing Mission Control — Saved Workspaces

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

The dashboard automatically saves demo missions (up to 2,000), statuses, the latest 12 activity events, selected venture/agent, and each panel's position, size, minimized state, and maximized state in `localStorage`. Minimized panels retain their geometry. Desktop positions and sizes are retained while mobile uses a stacked layout. Only one panel is maximized at a time.

**Reset demo** asks for confirmation, then restores all demo defaults, including missions and layouts. Cancel leaves your workspace intact. Reset only changes this app's `gulf-wing.demo-workspace.v1` storage entry; other browser data is untouched.

Storage is local to the browser profile and site origin (including the port), with no cloud sync or backup. Clearing site data removes the saved workspace. Windows and tabs in the same browser profile and origin receive saved updates automatically. Dedicated presentation windows are read-only consumers of saved data; exploring an agent there only changes that display. Simultaneous edits in multiple controller tabs still use last-save-wins behavior; use one primary controller for reliable editing. Do not put sensitive or production data into this demo.

Saved data is versioned and validated before loading. Malformed or unsupported data is replaced with demo defaults with a visible warning. Out-of-range panel geometry is constrained to supported bounds. If browser storage is blocked or full, the dashboard remains usable and warns that changes will only last until refresh. No save-success claim is shown after a storage failure.

## Multiple monitors, phones, and LG TVs

Open **Screens & TV** on the dashboard. Choose a mission overview, holographic core, mission board, or activity display. Each **Open display** button opens a named independent window; **Open here** is the fallback if pop-ups are blocked. Allow pop-ups only for this app if needed.

### Windows or Mac with several monitors

1. Connect the monitors or TV through HDMI, DisplayPort, or your supported dock.
2. In Windows, press **Win+P → Extend**; on macOS, select extended displays in System Settings → Displays.
3. Open the desired display views, move each window onto its monitor, and choose **Fullscreen**. Escape normally exits browser fullscreen. A complete overview and dedicated screen views use larger presentation typography, including layouts checked at 3840 × 2160.
4. Keep the original dashboard as your controller. Changes to demo missions, statuses, activity, and the selected venture appear in presentation windows in the **same browser profile and site origin**, without refreshing. Display modes have no mission-editing controls and do not overwrite saved workspace data.

### Phone or computer to an LG OLED TV

- **HDMI** from a computer (or a compatible phone adapter) is the most predictable option. Use mirroring or extended desktop as appropriate.
- **iPhone/iPad:** If your specific LG TV supports AirPlay, use Control Center → Screen Mirroring and select the TV. The devices typically need to be on the same local network. Enable AirPlay on the TV if its settings require it. Model/firmware support varies.
- **Android:** Use the phone's supported Screen Cast/Smart View/wireless-display option only if it is compatible with the TV or a connected receiver. Chromecast/Google Cast support varies by LG model and receiver; an ordinary web page cannot guarantee it.
- **Desktop Chrome/Edge:** Their browser/OS casting or wireless display controls can mirror a screen to a compatible receiver. Availability and menu names vary.
- Open the desired presentation view before mirroring. Fullscreen is offered when the browser supports it; unsupported or denied requests show a useful fallback message. The app does not automatically discover TVs, pair devices, or implement a Cast/AirPlay sender.

Screen mirroring shows the same session on the TV. Opening this app independently on a phone, TV browser, or another computer creates separate browser-local storage: **cross-device synchronization is not connected**. No cloud server, account, API key, remote control service, or public deployment has been added. A locally hosted development server is not automatically accessible from a phone or TV; network access and secure hosting would need a separate setup.

Keep the dashboard as the controller and the other windows as presentation screens. Closing a display does not close the controller or erase saved work. A presentation's local agent selection can differ from the controller's selection. LG hardware casting and multi-monitor placement require real-device checks; browser tests do not establish that a specific TV can connect.

## Validation

```powershell
npm run typecheck
npm run build
npx playwright install chromium
npm test
```

Browser tests start the production server automatically, so build first. They cover desktop/mobile mission creation, selected agents, task status, venture isolation, feed events, minimized/maximized panels, desktop movement/resizing, dialog validation, and horizontal overflow. Saved-workspace coverage also checks refresh persistence, venture isolation, panel geometry and mobile reflow, confirmed/cancelled reset, unrelated storage preservation, invalid saved data, and blocked/full browser storage. On Linux machines with preinstalled Chromium, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable path to avoid downloading a browser. `npm run start` serves a completed production build.

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
- `hooks/use-workspace.ts`: hydration-safe loading, automatic saving, and storage failure handling.
- `tests/`: Playwright functional coverage.

## Roadmap for real integrations

1. Define backend contracts, persistent task/event storage, authentication, workspace membership, and role-based authorization.
2. Add server-side provider adapters with secure secret storage, explicit opt-in, request limits, cancellation, and audit logs. Never ship keys to the browser.
3. Replace simulated events with authenticated streams; add job queues, retries, approval gates, and provider failure states.
4. Import verified token usage and provider pricing, enforce budgets, and reconcile estimates against invoices.
5. Connect each venture to authorized systems through narrowly scoped adapters; validate permissions and data retention before enabling automation.
6. Add cross-device workspace synchronization, full accessibility audits, integration tests, and deployment/security review as separate work.

No public deployment or live integration is included.
