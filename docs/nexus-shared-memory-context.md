# Shared local-memory retrieval envelope

`sharedMemoryContext(workspace, query, audience)` is an internal versioned retrieval contract used by the existing local answer route. It is not a public endpoint, new provider permission or assertion that all agents are connected. Callers retain controller/same-origin checks, workspace validation, provider eligibility and per-question sharing rules.

Version 1 carries the selected workspace, audience, current owner-context revision, current task-context stamp, owner records/context, saved-work records/context and explicit limits. Owner records contain stable IDs, workspace, revision, update time, SHA-256 of the current full record, owner-stated provenance, local-only status and excerpt markers. Work records retain their existing task identity/revision/state, bounded excerpts and unverified-history qualification. These record types are never merged into one fact list.

All applicable owner instructions within the existing 2,500-byte instruction budget are retained; there is no new instruction-count cutoff. Invalid legacy/externally modified over-budget instructions fail rather than silently disappearing. Relevant facts/preferences retain the existing six-match retrieval limit. Owner content is capped at 8,000 characters with explicit excerpt/truncation flags; metadata is additional. A shortened match is reported as partial in the prompt and the answer warning. The underlying global memory-record cap remains 500. Work history retains its two-record/six-hundred-character-per-excerpt bound.

Revision and task-stamp checks surround retrieval, and the answer route retains its existing before/after generation fences. Corrections, deletion and task changes produce new current context; older snapshots remain excluded from automatic answer sources through the existing snapshot-family guard. The model prompt receives compact instruction/fact context; the richer versioned records remain internal for adapter reuse.

For an external audience, this helper returns empty owner and work contexts with no private revision/stamp. Compare mode still appends private memory only to the local provider call, and external history remains withheld under the existing rules. This contract does not grant coding workers or future hosted adapters private owner memory. Additional agent bindings and write-back contracts need separate implementation and tests.

Validation covers current hashes/revisions, workspace isolation, owner correction/deletion, complete retention of in-budget instructions, explicit shortened fact excerpts, no external owner/task leakage and existing answer-generation freshness checks. No schema migration, credential change, source-note overwrite or provider request is added by the envelope itself.

## Local planning adapter

The local task planner now retrieves the same version-1 envelope as local answers. It includes current applicable owner instructions/facts and up to two relevant same-workspace task excerpts, preserving the untrusted-history wording. Planning source documents still pass through retained-snapshot exclusion. The running task is not eligible history, and owner instructions remain response guidance rather than execution authority. This adds no tools or cloud fallback and does not grant coding workers private memory.

Owner-context revision, task-context stamp and existing task/policy revision are checked after asynchronous knowledge reads, before model dispatch and after generation. A changed context rejects the result rather than completing a stale plan. The check also surrounds incomplete-output exceptions so obsolete partial content cannot be accepted as a review draft. An already dispatched local generation may finish before rejection; this is an acceptance fence, not a claim to cancel computation instantly. Existing coordinator cancellation/deadlines remain in force. Shortened owner excerpts produce an explicit coverage note.

Two local consumers now reuse this contract (answers and task planning). This is not a general agent gateway or provider memory grant. Historic notes remain excluded and external contexts remain empty under the existing audience rule.
