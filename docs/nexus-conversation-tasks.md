# Conversational task capture

Paired controllers in Auto or Local mode can record tasks through typed input or hands-free transcription:

- “Create a task to review the draft.”
- “Add a task: prepare the test checklist.”
- “Show my tasks.”

Commands use the selected assistant workspace (Personal by default). Creation uses the existing durable Foundation task store with planning mode and accepted state. It returns a task reference and explicitly says no action has started. This does not queue work, invoke a model/worker, contact anyone, schedule a reminder or authorize execution. Manage/queue/steer tasks using the existing Foundation controls. This is the first conversation-to-task slice of milestone 2, not a general task executor.

The browser attaches a UUID request identifier when supported. An identical create retry returns the same task ID without a new accepted event; different task details using that ID fail with a conflict. A new spoken repetition is a new request and can create another task. There is no automatic network retry or claim that cancelling a response undoes a committed record. UUID deduplication lasts while the task record exists; deleting it is not a retained idempotency ledger.

Listing returns up to ten latest records in the selected workspace, including their recorded statuses. Paired controllers remain trusted shared-owner access, not isolated customer tenants. Explicit cloud and Knowledge-only modes retain existing routing; imported documents and model output do not invoke the deterministic command parser. Deleting or changing tasks remains in Foundation. Relative dates in task text are stored literally, not scheduled.

Tests use synthetic records to check controller/display restrictions, persisted task state, repeat-request deduplication, scoped listing and no automatic work dispatch. Real typed and voice capture on the laptop/phone require operator acceptance after installing the update.
