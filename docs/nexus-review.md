# Nexus voice, knowledge and business foundation

## Problem and resulting behavior

Mission Control's agent nodes are simulated and previously could not search the
owner's business documents or speak. A new `/nexus` workspace now provides one
question box, private source-referenced knowledge retrieval, explicit voice
playback, optional local inference/transcription/TTS interfaces, and saved
Co-hosting planning records. Links from the dashboard and ScreenPad open Nexus.

Auto uses a configured local Ollama model; without one it returns clearly labeled
source excerpts. It does not silently call external providers or claim simulated
agents are connected. Responses identify their engine and retrieved source pages
or workbook sections. No model tools, external action execution or persistent
conversation memory are included in this phase.

## Implemented

- Private JSON/Markdown import UI and a read-only Obsidian vault snapshot importer.
  Imported text is evidence, not executable instructions. Source files are untouched.
- Server-side private storage outside Git for knowledge, operating records, draft
  estimates, marketing proposals and a timestamped change history.
- Saved Co-hosting Lead, Property and Job records, status changes, and a direct-cost
  / gross-margin estimate calculator. No customer estimate is sent automatically.
- Proposed monthly Meta / Google / LinkedIn allocations, bounded by the proposed
  total. No ad metrics, ad accounts, campaign activation, payments or spending.
- Device speech preview/answer/stop controls and voice selection. Device speech may
  use browser-managed network voices; offline behavior is not assumed.
- Optional loopback-only Faster-Whisper/Piper worker and authenticated Next.js audio
  proxy, with push-to-talk, transcript review, size limits and one request at a time.
- Existing paired controller/display roles, origin checks and bounded API inputs.
  Display-only sessions cannot write knowledge/business records or invoke models/audio.
- Explicit Not connected states and setup requirements for external agents/services.

## Private source handling

The uploaded four PDFs and workbook were reviewed. A separate private JSON pack
contains 46 sections from all five sources: PDF page text and cached spreadsheet
values with sheet/row references. It is handed off outside the repository, not
committed or served as a public asset. Workbook values are forecasts, not actual
results; formula caches were inspected but not independently recalculated.

The supplied operating plans distinguish conditional launches and approvals from
existing business evidence. Co-hosting's initial scope does not include brokerage,
reservation acceptance, rent collection or security-deposit custody. This phase
adds neither regulated actions nor inferred approvals.

## Validation

- Production build and TypeScript passed.
- Full browser suite: 98 passed, 8 intentional duplicate host-sync matrix cases skipped.
- Following the ScreenPad link addition, targeted Nexus/ScreenPad suite: 20 passed.
- Local model / voice proxy protocol check passed against synthetic loopback fixtures,
  including source context and concurrent-generation rejection. This is not real
  model inference, voice-quality or latency validation.
- Optional Python worker: 4 protocol/failure tests passed without model dependencies.
- Full private knowledge-pack import and Obsidian snapshot checks passed using
  disposable storage; hidden vault configuration was excluded and notes unchanged.
- Production npm dependency audit: zero vulnerabilities.
- Desktop/mobile production screenshots with synthetic sources show no page errors
  or horizontal overflow. See `docs/design/nexus-desktop.png` and `nexus-mobile.png`.

GitHub Actions also runs the new Node protocol and dependency-free Python checks.
Remote CI status must be checked on the PR; local success is not a remote CI claim.

## Required laptop setup and limits

Device speech can work immediately where the browser supplies voices. Real local
Whisper/Piper and Ollama require separate model/runtime installation and testing on
the ASUS. No models, paid services, API keys, remote account tokens or provider
subscriptions were installed. British voice availability is device/model dependent;
no performer voice is cloned. Wake-word listening is not enabled.

Android microphone capture requires HTTPS; the current plain HTTP LAN connection
supports typed queries but not phone push-to-talk. All paired display sessions can
read private records. This remains a single trusted host with unencrypted LAN
transport and no individual enterprise identities, tenant isolation or encrypted
application storage. It is not ready for resale or real advertising automation.

External adapters for ChatGPT, Claude, Gemini, Copilot, Codex, Hermes, OpenClaw,
Google Workspace and marketing platforms require separately verified account/API
access and implementation. Obsidian import is a snapshot, not a live connection.
Future work includes identities, per-entity permissions, secure transport/backups,
financial actuals/reconciliation, CRM workflows, supported read-only integrations,
and approval/cost controls before enabling external changes or spending.
