# Current-record search in Nexus conversation

In Auto or Local Ollama mode, type or say:

- “Search current records for Samsung”
- “Search my current memory and work for supplier phone”
- “Search current records in all workspaces for Samsung”

An optional “Nexus”/“please” prefix and “across all workspaces” variant are supported. A colon may replace “for”; trailing sentence punctuation is removed by the conversational parser. The selected memory workspace applies unless the all-workspace phrase is explicit. Other wording beginning with the recognized command prefix returns local usage help rather than being guessed into broader access or provider work. Quoted, negative or explanatory mentions do not match this deterministic command.

## Deterministic lookup and inspection

The controller/same-origin conversation API routes this command before provider planning, public research, file/knowledge retrieval or mutation handlers. It reuses the [live Foundation search service](nexus-current-record-search.md), including literal all-word query limits, current tables only, owner/task provenance, row/text coverage and bounded paging. External, Compare and Knowledge modes reject the command; enabling external sharing or entering public research terms does not send this lookup to a provider. The selected local model is not invoked or changed.

Nexus speaks/displays a short count/scope summary without owner contents or task excerpts. Structured results appear in the assistant using the same controller inspection component as Memory. The initial result is supplied directly by the conversation response, with no automatic second lookup. Explicit inspection and paging use the existing read-only service and its currentness guards. The embedded view can edit its own filters; it does not select a record for correction/deletion or register task execution authority.

A lookup or usage-help response resets recent conversation history and requests that the client clear old memory/task mutator references. Thus a prior selected “that memory/task” is not left active underneath a different read-only result. The lookup itself does not forget/correct anything. A later edit/delete requires the existing explicit memory/task selection flow. Changing the assistant's workspace clears its embedded record-search answer. A new assistant request unmounts/aborts pending embedded inspection.

## Scope and evidence

All-workspace lookup is an explicit view for the existing single trusted controller, not a multi-company tenant grant. No automatic agent context, owner facts, snapshots, provider permissions, model choice or task state changes. Returned task content remains unverified work history; a recorded completed state does not prove external work. Structured private content is not inserted into the spoken summary or forwarded as conversation history. Existing external-history withholding remains in place.

Validation covers explicit/quoted/help intent parsing, selected/all scope, current corrections, unchanged logical rows/events, zero network/provider calls (including external-sharing/public-research flags), controller/origin/mode/query guards, production typed/voice-flag API, embedded initial-result reuse, stale selection clearing and desktop/phone layouts. Existing memory mutation, normal/background voice conversation, model identity and search/spacing regressions are included. Browser and owned API fixtures do not establish native microphone/ASR accuracy or native Windows scale acceptance. A subsequent phase now supports [“Inspect current result one”](nexus-current-result-inspection.md) using an expiring, source-bound selection. This displays current detail without automatically speaking its contents; generic “read the third result” and conversation paging remain unsupported.
