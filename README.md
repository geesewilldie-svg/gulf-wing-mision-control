# Gulf Wing Mission Control — Phase 1

An original, futuristic command workspace built with Next.js App Router, TypeScript, Tailwind CSS, and Lucide icons. General command-dashboard concepts are the inspiration; no proprietary Agentic OS code or assets are used.

**Everything is DEMO.** GPT, Claude, Hermes, and Codex nodes are interface simulations. There are no model calls, connected accounts, telemetry services, actual charges, or API keys. Data resets on refresh. No paid services are required.

## Windows local setup

Install Node.js 24 LTS and Git for Windows. In PowerShell:

```powershell
git clone https://github.com/geesewilldie-svg/gulf-wing-mision-control.git
cd gulf-wing-mision-control
# If the PR has not merged, check out feat/phase-one-mission-control.
git checkout feat/phase-one-mission-control
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

## Validation

```powershell
npm run typecheck
npm run build
npx playwright install chromium
npm test
```

Browser tests start the production server automatically, so build first. They cover desktop/mobile mission creation, selected agents, task status, venture isolation, feed events, minimized/maximized panels, desktop movement/resizing, dialog validation, and horizontal overflow. On Linux machines with preinstalled Chromium, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable path to avoid downloading a browser. `npm run start` serves a completed production build.

## Structure

- `app/`: App Router shell, metadata, visual system, responsive styles.
- `components/dashboard.tsx`: interactive demo workspace.
- `components/workspace-panel.tsx`: reusable window controls.
- `lib/demo.ts`: typed, explicitly simulated data.
- `tests/`: Playwright functional coverage.

## Roadmap for real integrations

1. Define backend contracts, persistent task/event storage, authentication, workspace membership, and role-based authorization.
2. Add server-side provider adapters with secure secret storage, explicit opt-in, request limits, cancellation, and audit logs. Never ship keys to the browser.
3. Replace simulated events with authenticated streams; add job queues, retries, approval gates, and provider failure states.
4. Import verified token usage and provider pricing, enforce budgets, and reconcile estimates against invoices.
5. Connect each venture to authorized systems through narrowly scoped adapters; validate permissions and data retention before enabling automation.
6. Add saved window layouts, full accessibility audits, integration tests, and deployment/security review as separate work.

No public deployment or live integration is included in Phase 1.
