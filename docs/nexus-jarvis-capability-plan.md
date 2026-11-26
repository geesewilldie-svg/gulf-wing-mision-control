# Applying the supplied JARVIS transcript to Nexus

Source: [owner-supplied transcript chapter index](references/jarvis-video-owner-transcript.md), covering the fourteen-minute video, and [the five supplied workspace images](references/jarvis-workspace-owner-images.md). Keep this source separate from the hour-long Obsidian second-brain excerpt. Both contribute to [the shared memory/Galaxy contract](nexus-second-brain-reference.md).

The concrete target is an assistant interface over durable memory, selected storage, permitted tools and interchangeable inference adapters. The Galaxy is the navigable representation of real records and locations; its appearance does not establish access, knowledge completeness or execution authority.

## Map the transcript to build layers

| Transcript feature | Architecture requirement | Current Nexus / next work |
| --- | --- | --- |
| Spoken “switch your brain” and model indicator | One router resolves a configured adapter/model ID, checks availability and permissions, selects the eligible model and records which model actually answered. | Local-first routing and separate external-provider controls exist. General voice-driven model switching, hosted Venice/DeepSeek adapters and a unified verified catalog are not connected. |
| Continuity when changing models | Workspace-aware memory retrieval and per-provider history/context shaping; model selection must not reset durable notes or silently share local-only memory. | Local task-context retrieval, snapshots and journal slices exist. Common adapter-facing memory contracts remain next-stage work. |
| 3D files/folders | Host → selected location/drive → folder → file navigation with current identity, coverage and explicit opening. | Browse-only grants, directory pagination, storage/file stars, original views, rotation, labels and fullscreen are delivered. Global all-computer completeness and additional hosts are not claimed. |
| Canva, Notion, Gmail and other tools | A capability registry with per-adapter auth/readiness, input/effect contracts, scope and durable results. Tool calls return observed receipts rather than success inferred from an answer. | Existing Calendar/Drive controls and bounded coding work retain their contracts. New named tool integrations need actual supported adapters and account setup. Gmail sending is not connected by Calendar/Drive authorization. |
| Calling and texting | Separate telephony/messaging adapter, verified contacts/endpoints, costs, incoming/outgoing identity, delivery state and cancellation/receipt semantics. | Planned. Existing Android access and voice transcription are not a phone number or calling service. The video authorizes no outbound messages. |
| Camera and screen sharing | Explicit start/stop capture, visible state, bounded frame lifetime and defined local/provider processing. Stopping capture ends future acquisition; stale frames cannot be presented as current vision. | Planned. The pictured EYES label is not a live camera/screen capability. Existing microphone consent/state remains separate. |
| Browser inspection and REA-like report | An owner-requested site/asset inspection workflow over a verified tool/repository, bounded navigation and collected artifacts. Reports distinguish observation from inference and generated candidate code. | Existing reviewed web-link opening and candidate-code workshop do not establish a general browser-inspection adapter. Verify an interface before integrating a named REA repository. |
| Security testing of the owner's own site | A test profile bound to an actual authorized target, with finite checks, evidence, reproducible findings and reviewable fixes. | Extend existing independent test/workshop practices through a separate target-bound workflow. No scan or test target is created by this document. |
| Download/store model weights | A model asset record: source/license, identifier, version, hash, bytes, quantization, runtime, hardware needs and storage location. Download/verify/installed/runnable states are distinct. | Model acquisition/archiving is pending. No automatic model downloads; current hardware-aware local-first setup remains. Large model feasibility must be measured. |
| Hosted Venice model | Hosted inference is an external provider adapter with verified model IDs, credentials, sharing permissions, request limits and reported usage/cost state. | Candidate integration only. Do not enable or purchase it from this reference. Existing private-provider sharing rules remain. |
| Opinionated style | User-adjustable tone/personality belongs to response preferences, independently of selected inference adapter and tool grants. | Preserve the owner's chosen voice and settings. Do not copy the video's provocative political response into owner memory or use it as a capability test. |
| Prompt pack / paid packaged app | Reference material may be reviewed when actually supplied; assess content, dependencies and effects before using it. | Not fetched, joined, purchased, installed or audited. The architecture does not depend on buying the demonstration product. |

## Model selection contract

A future model-switch request must identify the requested model/adapter through the actual configured catalog. The result reports requested versus active model, local versus hosted execution, readiness, reason for refusal/unavailability where applicable and any selected fallback. No silent provider fallback for private questions. Switching models must preserve allowed memory context, workspace, source citations and the current file/Galaxy selection. Tone changes do not expand file access or tool authority. Selecting a hosted adapter does not authorize all private context to leave the host.

Validate catalog identities rather than hardcoding names heard in the transcript. The owner's Windows laptop has 8 GB RAM and a 2 GB GPU; feasibility of a large 27B-class or larger model is not established by the video's demonstration or by sufficient disk space. Keep inference readiness, model file storage and cloud-provider setup separate.

## Workspace interpretation from the pictures

The center is a large navigable memory field; collapsible left search/inspector and compact right filters/status surround it. Use the original Nexus spiral and luminous earlier reference as the visual base, with truthful colored categories and contextual labels. Keep the explicit no-visible-lines requirement even though the JARVIS demonstration shows edges. On phone layouts, use drawers/sheets and touch controls rather than a miniature desktop.

The assistant ring should distinguish microphone off/listening, model configured/ready/answering and tool pending/completed/unconfirmed using actual state. EYES/HOLO/FOCUS/REFLEX are pictured ideas, not defined contracts. A display-only focus mode can hide peripheral panels without changing processing; capture and autonomous effects require separate adapter implementations. Do not display a fake active-model name, ONLINE badge or model cost.

## Integration sequence

1. Finish the visual workspace: source/type filters, selected-record inspector, fit/reset, search-to-star and reference lighting/depth while preserving real file opening.
2. Formalize the common memory retrieval/work-note receipt interface and current-note lifecycle, as required by the separate Obsidian excerpt.
3. Add capability-aware model selection and truthful model/assistant status over existing supported adapters; validate configuration and hardware without sending an unapproved generation probe.
4. Implement additional tools one at a time with explicit inputs/effects, target/account scope, readiness and durable receipts. Browse-only grants remain independent of model and tool access.
5. Treat telephony, capture, hosted providers, model acquisition and public-site inspection as separate adapter milestones. Complete and test each before its interface claims availability.

## Acceptance evidence

- Switching between two permitted fixture adapters preserves the same current allowed memory and workspace; denied/private-only context is absent from the external envelope. Requested and actual model identity are visible.
- A provider/model that is missing, unavailable or out of quota is reported honestly; it does not trigger a hidden paid retry or provider substitution.
- A file star points to a real current resource. Focus reads metadata only; explicit open checks access/version; browsing a drive does not index or share it.
- A tool request records its actual effect/result, including failed, cancelled and uncertain outcomes. A generated “done” sentence is not an execution receipt.
- A completed authorized run produces a provenance-bearing work note; a second permitted adapter can retrieve the current relevant note without promoting its unverified content to an owner fact.
- Capture and telephony controls have real lifecycle and delivery checks before being labelled ready; current microphone and provider-sharing preferences persist independently of model switching.

This plan changes documentation, not runtime configuration. Existing authorized task journaling continues; no provider, model download, camera, telephony service, external account, browser-inspection target or unattended tool execution is enabled by the video or this document.


## Concrete connection destinations supplied by the owner

The owner supplied `github.com/morluto/rea`, `huggingface.co` and `venice.ai`. [Reference connection architecture](nexus-reference-connections.md) now pins the verified REA source/package, documents runtime and browser constraints, and defines separate Hub model-asset and Venice hosted-inference adapters. The three appear in setup inventory as planned targets, not connected runtime providers. The general REA repository uncertainty above is resolved by the source review; target-specific execution and model/provider availability remain separate verification.

Implemented model-identity slice: existing supported adapter status now exposes configured request-model IDs without a generation probe; successful answers show per-call requested and provider-reported IDs. The latter are response metadata, not independent model verification. This advances the catalog/indicator requirement, while voice-driven model switching, new hosted adapters and model acquisition remain unconnected. See `nexus-model-identity.md`.

Installed local model discovery is now implemented as an explicit bounded Ollama catalog inspection, separate from inference and model selection. Reported installation/configured presence does not imply loaded or runnable readiness. It does not add Hub downloads or hosted providers; see `nexus-local-model-catalog.md`.

The first explicit model-switch slice now supports a one-question installed local model choice for typed Local Ollama answers. It retains permitted memory and reports request/response identity without changing the saved default or adding providers. General voice-driven switching and persistent selection remain pending; see `nexus-local-model-choice.md`.

REA execution evidence now includes an owned loopback browser self-test and an explicit bounded saved-run history/export. Historical outcomes remain separate from current readiness and do not enable external-site inspection. This advances durable tool-result review without adding a provider or personal browser attachment; see `nexus-rea-owned-browser-self-test.md`.
