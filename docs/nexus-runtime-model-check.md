# Inspect a recorded local model

Archive history now offers **Inspect runtime model** for retained creation runs. This explicit read-only action checks the current runtime catalog and metadata against the recorded generated alias and a freshly verified archived source. It neither recreates a model nor promotes an uncertain creation outcome.

The controller-only, same-origin action accepts exactly `check-runtime-model`, archive slot, source receipt SHA-256 and creation run UUID. Caller model names, paths, URLs and runtime options are rejected. Full current source size/hash and receipt identity are checked within the existing cooperative ten-minute source-operation bound. Catalog/show observations have a combined twenty-second deadline after hashing; source metadata inspection is bounded to 8 MiB. Final source, creation receipt, catalog entry and configured-selection checks reject changing evidence.

## Current results

- **Matches record:** a previously accepted creation has the same reported manifest digest and compatible GGUF architecture metadata.
- **Present, unconfirmed:** the generated alias is currently listed with compatible metadata, but its original creation was not accepted. That historical outcome stays unchanged.
- **Changed:** the recorded manifest digest or available format/architecture comparison disagrees.
- **Not listed:** the alias is absent from a completely observed catalog.
- **Coverage incomplete:** catalog omissions or rejected entries prevent an absence conclusion.
- **Identity unavailable:** required digest, format or architecture information is missing.

Manifest identity differs from the archived weight-file SHA-256. Matching runtime reports do not independently authenticate stored runtime bytes or establish inference readiness. The inspection makes only fixed loopback catalog/show requests, writes no receipt and performs no upload, creation, pull, deletion, selection or generation. Current results can be downloaded as session JSON; a saved result is a dated observation, not lasting readiness evidence.

Only a matching accepted creation with a reported completion capability offers the existing [fixed local diagnostic](nexus-local-model-check.md). A separate button must request that test; inspecting or exporting never starts it. The diagnostic rechecks runtime identity, uses no owner memory/files/conversation, requests eight output tokens and a 512-token context, and stops waiting after 45 seconds. Parent inspection controls stay disabled while it runs. Neither an inspection nor a diagnostic rewrites the creation receipt's `inferenceReady: false`.

Validation uses disposable source files and an owned HTTP runtime fixture, including the compiled production API and populated desktop/phone UI. Actual Ollama tensor parsing, real-model inference and native Windows acceptance remain unverified by these fixtures. Uncertain creation recovery, broader model lifecycle and provider routing remain separate work.
