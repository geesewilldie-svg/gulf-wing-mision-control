# Local GGUF metadata inspection

Connections → Models and tools → Local model archive offers **Inspect GGUF metadata** for a published file whose current size matches its inspected receipt. This is an explicit, read-only prerequisite for later runtime review, not a runtime importer or model benchmark.

The controller-only, same-origin archive endpoint accepts exactly `action: metadata`, a fixed archive slot and the inspected receipt SHA-256. No caller path, provider URL, credential or execution parameter is accepted. It binds the current receipt and rechecks file, receipt and directory identities around a read of at most 1 MiB. File size, modification/change times and identity changes reject the result. Original bytes, receipt and modification time remain unchanged. No provider request is made.

The bounded parser supports little-endian GGUF versions 2 and 3. It walks typed metadata entries, skips bounded arrays, rejects unsupported versions/types, unsafe counts and duplicate keys, and projects only the declared name, architecture, context length, embedding length and block count. Counts come from the header, not tensor validation. Unknown fields remain unknown. Metadata that extends beyond the inspected prefix or ends early is labeled partial. Long, control-character or unsupported projected values are withheld. Metadata coverage does not establish tensor descriptor/data validity, whole-file hash agreement, licensing, hardware fit or runtime compatibility.

Inspection does not execute repository code, import into Ollama, change a selected model, modify memory or enable a provider. The existing separate current-file hash action remains necessary for full local-record byte comparison. File metadata is untrusted declaration, not independently verified model identity. Runtime import/readiness and live provider acceptance remain later phases.

Validation uses synthetic GGUF fixtures, actual disposable local file reads, API authorization checks and populated desktop/phone UI checks. It is not evidence of acceptance by a real inference runtime or native Windows file handling.
