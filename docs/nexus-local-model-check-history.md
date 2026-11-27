# Saved local model diagnostics

Completed fixed local model tests now save bounded metadata locally. **Connection activity → Saved local model diagnostics** offers an explicit read and JSON export after refresh. Reading history does not contact Ollama or run a model; the normal current catalog/details flow remains separate.

A completed result records the run UUID, requested/reported simple local model names, reported manifest digest, completion time, elapsed milliseconds, passed/unexpected-response state and reported output-token count. Raw response text, thinking, context, prompts, owner memory, file contents and arbitrary runtime fields are not saved. Historical success describes that one test, not current identity, loaded state, future readiness or a hardware benchmark. Unexpected completed output is retained without storing its text. Failed, cancelled, incomplete and uncertain requests are not included; this is not a complete audit log of runtime attempts.

## Preservation and limits

The fixed private `local-model-check-receipts` directory holds at most 100 exclusive numbered JSON files, each bounded to 8 KB. New completed results claim the first unused slot, sync and read back their known-field projection, and check directory/file identity. Existing files, unsafe/malformed records and uncertain writes are never overwritten, deleted or retried automatically. No pruning or metadata repair is included. Root/directory/file symlinks or changed identities reject acceptance; this uses the existing trusted local data-directory boundary rather than independent host-process authentication.

History reads inspect only those fixed 100 slots. They reject oversized, malformed, unsupported, duplicate-run or unsafe records and report occupied/withheld/valid counts. The newest twenty valid records are displayed/exported with an observation timestamp. Extra fields in otherwise valid records are withheld through projection. Invalid records consume capacity and remain unchanged. Missing storage is reported without creating it. Cancellation abandons the read without a runtime call.

The diagnostic's accepted session result and its history save are separate: `receiptState: saved` means this save was synced and read back; `pending` means full, unavailable or unconfirmed storage. A completed result remains visible/exportable even when history cannot be saved. Do not rerun inference solely to repair metadata. A client disconnect after completion can still leave a saved result; cancellation does not undo already completed work. Stored records are local operational history and are not automatically added to owner memory, knowledge retrieval or provider prompts.

## Access and validation

The controller-only, same-origin POST accepts exactly `{ "action": "local-model-check-history" }`. Caller paths, filters, runtime options and extra fields are rejected. The normal fixed diagnostic keeps its separate explicit run button and existing source-independent digest/current-selection checks; saving does not rerun it or change any model/creation receipt.

Validation covers real disposable filesystem preservation, bounded capacity and newest-first coverage, known-field projection, unsafe/duplicate/malformed records, storage failure without repeated inference, controller/origin guards, the compiled production history endpoint and populated desktop/phone reads/exports. Owned HTTP fixtures establish API behavior; they do not establish actual Ollama inference or native Windows model acceptance.
