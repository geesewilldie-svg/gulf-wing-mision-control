# Conversational owner memory — milestone 3 foundation

Paired controllers can manage local owner records through Auto or Local mode, using the selected memory workspace:

- “Remember that I use Android.” saves a fact.
- “Remember my preference: keep explanations concise.” saves a preference.
- “Remember my instruction: distinguish forecasts from actual results.” saves an instruction.
- “Show my memory” or “Show my preferences” retrieves up to twenty matching records in this workspace.
- Select a record, then say “Correct that memory to …” or “Forget that memory.” A specific content fragment or stable reference may also identify a record.

Commands use the existing Foundation SQLite records, revision history, search index and context invalidation. They do not implement a separate competing memory system or retrain model weights. Exact duplicate saves of the same category/content/scope return the existing record without revising it or pausing work. Ambiguous corrections/removals offer scoped choices and change nothing; an older selected revision cannot overwrite or remove a newer record. References and selected records are page-session context; saved records survive restarts and are shared across trusted paired controllers.

Memory commands are blocked in cloud, Compare and Knowledge-only modes with an instruction to choose Auto/Local, before any provider call. No saved memory is added to external model prompts by this feature. Existing explicit external-sharing rules remain separate. Saving an instruction does not authorize a tool, worker, account write or spending; deterministic permissions still apply. Recording a device preference also does not change that device's settings.

## Context behavior

The existing context builder always includes applicable owner instructions, subject to its existing aggregate instruction budget. Facts and preferences are retrieved for local answers/plans by relevance; this release does not promise that every saved preference applies automatically to every answer. Personal memory participates in local context across workspaces, while conversational listing/editing resolves records in the explicitly selected workspace. Shared controllers are trusted owner devices, not separate customer identities.

Memory changes increment the owner-context/policy revision. Active planning with outdated context is invalidated under existing Foundation rules. New answers compare the browser's observed revision with current owner context, omit stale conversation history and tell the client to clear its history buffer. A memory change during answer generation causes the stale answer to be rejected rather than presented as current. Successful memory writes also reset the active voice session's recent-turn history; Foundation save/delete controls emit the same context-reset event. Read-only memory search does not emit it.

Forgetting removes the active record, its correction history and search entry. Previously saved task output, backups, already delivered speech and text already shown are separate artifacts and are not erased. This is not a secure-erasure claim. Corrections/removals of selected records use store revisions; named operations without selected context use the freshly read record revision and the store checks it again before writing.

## Boundaries and acceptance

This is a conversational integration slice of architecture milestone 3. It is not a general natural-language authorization engine, identity isolation, secret vault, scheduler, external account connector or guarantee of model recall/accuracy. Reminders and arbitrary “remember to do…” requests are not silently converted into scheduled actions. The parser recognizes explicit memory wording from the current owner request; source documents and model output do not invoke it.

Verification covers synthetic owner records, duplicate saves, stale corrections, workspace separation, local-only routing, deletion, reload selection, voice history reset, shared answer context and existing Foundation/permissions regressions. Real microphone transcription quality and real model application of preferences remain distinct acceptance concerns. No real credentials or owner records are created in the test environment.
