# Conversational task capture

Paired controllers in Auto or Local mode can record tasks through typed input or hands-free transcription:

- “Create a task to review the draft.”
- “Add a task: prepare the test checklist.”
- “Show my tasks.”

Commands use the selected assistant workspace (Personal by default). Creation uses the existing durable Foundation task store with planning mode and accepted state. It returns a task reference and explicitly says no action has started. This does not queue work, invoke a model/worker, contact anyone, schedule a reminder or authorize execution. Conversational steering now shares the existing Foundation controls described below. This is a bounded milestone-2 implementation, not a general task executor.

The browser attaches a UUID request identifier when supported. An identical create retry returns the same task ID without a new accepted event; different task details using that ID fail with a conflict. A new spoken repetition is a new request and can create another task. There is no automatic network retry or claim that cancelling a response undoes a committed record. UUID deduplication lasts while the task record exists; deleting it is not a retained idempotency ledger.

Listing returns up to ten latest records in the selected workspace, including their recorded statuses. Paired controllers remain trusted shared-owner access, not isolated customer tenants. Explicit cloud and Knowledge-only modes retain existing routing; imported documents and model output do not invoke the deterministic command parser. Deleting tasks remains in Foundation; corrections and state changes can also be requested through the assistant. Relative dates in task text are stored literally, not scheduled.

Tests use synthetic records to check controller/display restrictions, persisted task state, repeat-request deduplication, scoped listing and no automatic work dispatch. Real typed and voice capture on the laptop/phone require operator acceptance after installing the update.


## Conversational task steering

In Auto or Local mode, use an explicit task name or stable full reference:

- “Pause task car stereo” / “Pause my car stereo task.”
- “Show task car stereo” / “What is the status of that task?”
- “Change task car stereo to check the microphone after installation.”
- “Resume that task.”
- “Cancel that task.”

“That task” refers only to the task returned by a recent create/status/control response or explicitly selected from the task buttons. It is page-session context, cleared on workspace changes, loss of access, task lists and unresolved/ambiguous responses. A list does not silently select the first result. After a reload or on another device, name the task or list and select it again. An ambiguous title returns up to ten choices and changes nothing; task matching searches all saved records in the selected scope, up to the store's 1,000-task cap. Unknown targets do not trigger a model to guess.

Task context carries the observed revision. Controls that would change a task using an older selected revision fail with a conflict; ask for status to read the current state before trying again. Named controls without a matching selected context use the freshly read revision. The Foundation transaction checks that revision again at mutation. Repeating a mutation with an old revision cannot apply it twice. Cancellation does not delete artifacts or undo prior effects. Objective corrections pause the revised task and clear stale output. Resume queues only planning tasks through existing owner-policy checks, without external worker permission; development tasks must be reviewed in Foundation before dispatch. The coordinator's existing revision watchdog aborts stale work and blocks stale result commits.

Status replies expose stored state and reason; an expandable view shows saved output and update time. A planning record marked completed does not establish that the requested real-world action occurred. There is no new general Windows execution, scheduler, cloud-worker grant, or automatic task deletion in this change.

Verification: production build and 40 Foundation/task/assistant regression checks passed, followed by ten focused steering checks including stale revisions, scope isolation, ambiguity clearing, reload retrieval, planning queueing and blocked development-worker authorization. No provider inference or external execution was required by these fixtures. Real typed/voice laptop and phone acceptance remains pending installation.


## Feedback and recovery repairs

Repeated pause on a paused task, repeated cancel on a cancelled task, and resume on already queued/running work return its current saved state without a new transition, event or duplicate queue entry. Finished or failed tasks return a useful state explanation when the requested operation is inapplicable. These read-only responses can refresh selected context; actual mutations still enforce revisions and owner policy. A retried creation reports the current state if its existing record has advanced.

If a task cannot be identified, the assistant offers available tasks from the selected scope so the owner can recover without re-creating records. It does not silently choose one. The submitted request, result and any error appear together above the voice controls; typed feedback scrolls into view, while active voice sessions do not auto-scroll. Selection buttons are full-width and wrap long titles on phones.

Build and 26 desktop/mobile task and assistant-shell checks verify the observed already-paused case, unchanged revisions on repeated commands, accurate retry state, recovery choices, stale mutation rejection, and visible request/error feedback. Native acceptance remains necessary after installation.
