# Review: Android/Windows shared command workspace

## Suggested pull request title

Add local device synchronization and holographic multi-screen workspace

## Result

Gulf Wing now supports a Windows laptop host with paired Android/Windows controllers and independent display screens. Missions, statuses, venture/agent selection, activity, and workspace layouts synchronize against a versioned, disk-backed local workspace. Browser-only work remains separate and can be explicitly published to the shared host.

The original cinematic dashboard includes the interactive particle core, galaxy/graph views, segmented cyan HUD rings, multi-monitor pop-outs, presentation layouts, fullscreen controls, and reduced-motion support. The supplied cinematic images are retained as documentation references; runtime visuals are original.

## Pairing and recovery

- Optional host setup through `npm run sync:setup`; no cloud service or external API key.
- Signed, 24-hour HttpOnly sessions; server-enforced controller/display roles; origin checks and bounded requests.
- Atomic disk storage and revision checks. Conflicts retain pending edits and require a version decision.
- Offline retries, tab-reload recovery where sessionStorage is available, and re-pairing without discarding in-memory edits.
- Confirmed shared reset, confirmed publication of a private local workspace, and disconnect back to the preserved local workspace.
- Pairing-code rotation invalidates old sessions while preserving saved workspace data.

## Validation

- Production build and TypeScript passed.
- Full suite: 76 passed; 8 duplicate shared-host matrix cases intentionally skipped because those cases already instantiate independent Android and desktop sessions.
- Targeted host suite after adding publication assertions: all 8 cases passed, with duplicate matrix cases skipped.
- Production dependency audit: 0 vulnerabilities.
- Actual host restart retained the workspace, revision, and pairing configuration.
- Initial and repeat setup checks passed without exposing generated pairing values.
- Final Windows, Android, and presentation screenshots: no browser errors or horizontal overflow. See [design QA](../design-qa.md).

## Setup and limits

Follow the [Windows host instructions](../README.md#android--windows-cross-device-synchronization). Intended arrangement: ASUS Windows laptop hosting one Node process, an HDMI-connected LG TV displaying a Windows browser, and the Galaxy S25 Ultra paired over the same trusted private Wi-Fi.

This is private-LAN HTTP infrastructure for demo data. Do not port-forward it or expose it publicly. Production HTTPS, external access, full identity/authorization management, per-task conflict merging, and physical-device validation remain separate work. LG webOS browser compatibility and ScreenPad driver behavior are not asserted by browser tests. AI agents and costs remain simulated; no model calls, paid services, or public deployment are included.

Review before merging; no automatic merge or deployment.
