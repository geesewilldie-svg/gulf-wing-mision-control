# Questions about one captured frame

The active camera/screen preview now includes **Question about this frame**, initially filled with a short description request. After inspecting a local model with reported vision/completion support, **Ask about this frame locally** samples one new frame and sends it with that question to the existing local vision adapter.

Each question is independent. Editing, model changes, another request, denial/mismatched evidence, capture stop or navigation clears the displayed result. There is no image conversation history, automatic follow-up, recording, saved question/answer, memory retrieval, hosted fallback or tool execution. A question about a screen does not authorize links, commands or instructions shown on it. Voice-driven visual questions remain future work.

## Input and provenance

Questions must contain 1–1000 supported characters, with surrounding whitespace removed. Empty/whitespace-only, non-string, oversized, control-character and misleading directional-control inputs are rejected before runtime calls. The UI disables empty/unsupported submissions and blocks question editing while a request is pending. The client checks that the returned question matches the submitted normalized question, alongside the existing source/time/dimension/byte/model checks. A mismatched response cannot be displayed under a different question.

`analyze-local-frame` now accepts the existing seven source/model/frame/intent fields plus an optional `question`. Old seven-field callers retain the default description question. Caller system prompts, histories, runtime options, image URLs and extra fields remain rejected. The local runtime receives the one normalized question inside an application-owned prompt envelope and a fixed system instruction, plus exactly one JPEG. Prior questions, model answers, owner facts and retrieved sources are not added. The question is returned as session provenance and rendered as plain text with the unverified captured-frame answer; it is not an owner fact or execution receipt.

All [single-frame limits](nexus-local-frame-analysis.md) remain: bounded fresh input, one digest-bound local model with vision/completion, shared inference admission, one request with fixed output/context/unload settings, bounded response, post-generation identity/default checks and no retries. Runtime uncertainty after cancellation/timeouts remains visible. Nexus adds no image/question/result persistence or diagnostic history entry.

## Validation and remaining integration

Tests cover default compatibility, normalized independent questions, exact character boundaries, rejected system/history/options, unchanged files, one-image/no-context request bodies, explicit UI submission, empty disabling, edit-time clearing, mismatched-question rejection and stop-time discard. The compiled production API sends one explicit question and synthetic browser JPEG to an owned HTTP runtime fixture. Desktop/phone populated question/result layouts are inspected. Actual vision-model accuracy, image decoding, physical device capture and native laptop hardware fit remain unverified by fixtures.

Venice official docs and schema access were retried November 27, 2026; the environment proxy still rejected both CONNECT requests with HTTP 403. No Venice provider capability was inferred, enabled or routed as part of this phase.

Spoken-draft continuation: [record and review a visual question](nexus-spoken-visual-questions.md) now lets the owner explicitly record short audio, review local transcription and copy it into the typed question. A separate image submission remains required; hands-free visual conversation is not implemented.
