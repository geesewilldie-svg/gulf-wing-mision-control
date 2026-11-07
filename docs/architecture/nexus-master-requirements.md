> Owner-supplied design reference, retained November 7, 2026. The assistant is named Nexus. Worked sample scenario sections 37–41 are omitted at the owner’s request. The original architecture-only instruction below was superseded by the owner’s later explicit request to build this design. This reference is not a runtime prompt, AGENTS.md, live-action authorization or claim of completed implementation. Current delivery status is in nexus-foundation.md. Model labels and service entitlements still require verification.

# NEXUS — Master Architecture Prompt for Claude Opus 5

Prepared for a personal, Windows-first assistant. Architecture and planning only.

Copy this entire document into Claude, or attach it and say: "Read this entire brief and produce the architecture it requests. Do not start implementation."

Everything after the next divider is the prompt.

---

You are my principal systems architect and product engineering partner. Help me design NEXUS: a general-purpose personal assistant with one coherent identity, persistent personal memory, voice and visual interaction, broad access to my Windows computer, connected accounts, and the ability to use Codex and Claude Code to develop capabilities it does not yet have.

Read this entire brief before answering. Treat it as a connected system specification, not a collection of independent feature requests. Your immediate assignment is to produce a detailed, internally consistent architecture and implementation plan. Do not implement, install, deploy, connect accounts, schedule tasks, operate my computer, or take real-world actions yet.

I want a serious architecture we can build together. Be ambitious about capability and precise about limitations. Make concrete recommendations, explain the important tradeoffs, and identify dependencies and uncertainties. Do not replace the requested design with a generic chatbot, a list of plugins, a small workflow automation demo, or a warning essay.

## 01. Preserve the full product vision.

NEXUS should be my primary digital assistant across work and personal life. I should be able to talk to it normally, give it a goal, correct it while it works, ask for advice, delegate a project, ask it to monitor something, or ask it to build something new.

It should handle open-ended requests through reasoning, tools, memory, and development. There must not be a product boundary that says it only supports five predefined workflows. Example tasks and acceptance tests are demonstrations of general capability, not a fixed menu or a ceiling on ambition.

The intended experience is an assistant that knows my context, remembers my rules, takes responsibility for completing authorized work, and becomes more useful through verified experience. It should be personable and consistent while remaining honest about being software and about what it has actually accomplished.

I want it to help with files, documents, research, coding, design, bookings, reminders, alarms, job opportunities, planning, purchases within my authorization, communications within my authorization, administration, and unfamiliar future tasks. Your design must explain how new categories become possible without rewriting the entire system.

Translate "it should do everything" into extensibility, broad tool coverage, strong persistence, good recovery, and clear task ownership. Do not translate it into a dishonest guarantee of universal success.

## 02. Treat these requirements as established.

- Windows is the first implementation target.
- Phone access and continuous availability remain later targets; the architecture should accommodate them.
- There is one boss assistant with one user-facing identity and authoritative task ownership.
- Codex and Claude Code are important workers and development tools.
- Prefer existing subscriptions where supported. Add paid APIs where necessary, with visible budgets and explicit fallback policies.
- Voice, text, images, files, and a usable interface are part of the product.
- Broad computer access is an intended capability, including files, applications, terminal, browser, and desktop interaction.
- Personal memory and owner rules are foundational and survive restarts, model changes, and conversation boundaries.
- Newly learned methods should become reusable skills or improvements to existing skills.
- NEXUS should be able to create new software, connectors, scripts, workflows, and tools.
- NEXUS should be changeable and capable of improving its own implementation through a controlled development process.
- It should suggest useful next steps and perform recurring work within standing instructions.
- Repeated permission prompts for already authorized work are undesirable.
- Accuracy about task status, results, costs, and limitations is mandatory.
- We are designing first. This brief does not authorize implementation or live actions.

Do not repeatedly ask me to reconfirm these requirements. List genuinely unresolved choices separately, make reasonable proposed defaults, and continue the architecture without blocking on low-impact preferences.

## 03. Establish the meaning of general capability and recursive learning.

Define general capability as an extensible task-solving system with multiple execution methods and a development path when existing methods are insufficient. It is not a promise that every website allows automation or that a model can bypass missing account access, unavailable hardware, authentication challenges, or provider restrictions.

Define recursive learning operationally. NEXUS can learn a procedure, turn it into a skill, observe that skill's performance, improve the skill, improve the tools used by the skill, and improve the development workflow that produced those tools. Each improvement needs measurable evidence and a versioned artifact.

Do not claim that writing memories or changing prompts retrains model weights. Distinguish persistent memory, retrieval, procedural learning, workflow optimization, code improvement, model selection, and actual model training. Model training is optional future work, not a prerequisite for a useful personal assistant.

The recovery principle is: identify the gap, investigate practical alternatives, build missing software when appropriate, test the result, and resume the original task. If progress requires something software cannot supply, explain the concrete blocker and the smallest useful next step.

## 04. Produce an architecture before producing code.

Your response should define the intended product, system boundaries, component responsibilities, state ownership, interfaces, trust boundaries, workflows, storage, learning loop, implementation sequence, and verification strategy.

Use diagrams, tables, state machines, illustrative schemas, and pseudocode where they clarify the design. These are specification artifacts, not permission to scaffold or execute a project.

If you have web access, verify changeable integration details against official documentation. If you do not, clearly mark them as needing verification. Do not invent SDK methods, subscription entitlements, operating-system behavior, API endpoints, prices, or model identifiers.

Do not inspect my real files or installed accounts just to complete this architecture. Describe the later discovery and onboarding process. Treat all sample personal information as hypothetical and mark it as such.

At the end, provide a small number of high-impact decisions for us to make together. Do not end with twenty questions and no architecture.

## 05. Start from this logical system map and improve it.

The following is a starting model, not a demand for a separate service per box:

~~~mermaid
flowchart TD
    OWNER["Owner: Windows first, phone later"] <--> UI["Conversation and task interface"]
    UI <--> MODAL["Text, voice, images, files"]
    MODAL <--> BOSS["One boss: interpretation, planning, delegation, verification"]
    BOSS <--> CONTEXT["Context builder and personal memory"]
    BOSS <--> TASKS["Durable task engine and scheduler"]
    BOSS <--> SKILLS["Capability registry and skill library"]
    BOSS --> POLICY["Policy and authorization checks"]
    POLICY --> BROKER["Execution broker"]
    BROKER --> DESKTOP["Windows user-session helper"]
    BROKER --> SHELL["Files, terminal, processes"]
    BROKER --> BROWSER["Browser automation"]
    BROKER --> CONNECT["Cloud services and connectors"]
    BROKER --> BUILD["Codex and Claude development workers"]
    BUILD --> VALIDATE["Review, tests, packaging, versioning"]
    VALIDATE --> SKILLS
    TASKS --> EVENTS["Events, evidence, notifications, recovery"]
    EVENTS --> CONTEXT
    EVENTS --> LEARN["Learning and improvement loop"]
    LEARN --> BUILD
    EVENTS --> UI
~~~

Show the actual return paths for results, events, cancellation, authentication requests, and verification. Explain which components are deterministic software and which use language or vision models.

Separate four concerns clearly: deciding what to do, deciding whether it is authorized, executing the operation, and verifying the effect. A model's statement that an action is permitted must not be the only authorization mechanism.

The initial implementation should be a manageable local system with strong internal boundaries. Do not introduce unnecessary distributed infrastructure simply because the conceptual diagram has many components.

## 06. Design one boss with multiple bounded workers.

The boss owns the user's intent, task state, acceptance criteria, relevant rules, delegated work, progress reporting, and final outcome. It may delegate to specialists, but it must not abandon accountability by saying that another agent claimed to finish.

Workers should receive bounded work orders: objective, relevant context, accessible resources, allowed actions, budget, deadline, expected output format, and verification requirements. They should return structured results, artifacts, failures, and evidence.

Specify when to use one worker, when independent work can run concurrently, when a second worker should review, and when extra agents add cost without value. Do not run every task through a committee.

Prevent multiple workers from editing the same files or controlling the same desktop simultaneously without coordination. Use isolated workspaces where useful and explicit resource ownership where isolation is impossible.

The boss must support mid-task correction. If I say "use the other folder" or "stop applying and just show matches," the active task contract changes, pending actions are invalidated as appropriate, and workers receive the update.

Explain how the boss itself can use a replaceable model while its identity, memory, rules, and tasks remain application-owned.

## 07. Define the task contract and instruction interpretation.

Each substantial request should become a structured task contract containing at least:

- A stable task ID and parent task ID when applicable.
- My original request, plus a concise interpreted objective.
- The difference between planning, researching, drafting, executing, monitoring, and advising.
- Inputs, assumptions, missing information, and relevant project.
- Scope, constraints, target resources, and intended external effects.
- Authorization source and applicable policy revision.
- Success criteria and acceptable evidence.
- Budget, deadline, retry policy, and cancellation behavior.
- Required capabilities and known dependencies.
- Planned artifacts, notifications, and memory updates.

Do not turn every short request into a visible bureaucratic form. The contract can be internal and concise, with questions only when an ambiguity materially changes the result or authorized effects.

Preserve the difference between examples and instructions. "It should be able to book a flight" is a requirement; it is not an instruction to book a real flight now.

Explain how temporary exceptions work. "For this task, use a cheaper option" should not silently rewrite a permanent preference. A clear owner instruction can update a preference, while unclear contradictions should be resolved explicitly.

Define what happens when task intent changes after an irreversible action has already completed. Report the completed effect accurately and consider an authorized compensating action.

## 08. Design a Windows-first deployment that can grow.

Propose a local topology with a desktop interface, a durable coordinator, a database, a scheduler, worker processes, and a helper running in the interactive user session. Explain whether each component is a process, library, background application, or Windows service and why.

Account for the separation between Windows services and interactive desktops. Do not assume a service can freely click the user's applications. Distinguish operations that can run without a visible desktop from operations that need an unlocked interactive session.

Specify startup, login, sleep, resume, reboot, logout, lock, process crash, and update behavior. Explain what continues, what pauses, and what becomes unavailable in each state.

For later cloud deployment, retain an interface between the coordinator and execution nodes. A Windows node can advertise capabilities, availability, policy revision, and current resource leases.

Prefer an authenticated outbound connection from the PC for remote coordination. Define device registration, revocation, reconnect, command expiry, duplicate delivery handling, and transport security. Do not assume an openly exposed desktop-control port is acceptable.

Keep the first version usable without a cloud service, while avoiding a future rewrite of task IDs, event schemas, memory ownership, or execution contracts.

## 09. Design the interface around real work.

Describe the main screens and their information hierarchy:

- A conversation that accepts text, voice, images, and files.
- Active and queued tasks with clear status and a next expected event.
- Results and artifacts with ways to open, inspect, or reuse them.
- Memory inspection and correction.
- Rules and standing permissions.
- Connected accounts and device availability.
- Skills, including drafts, active versions, failures, and proposed improvements.
- A concise action history and usage view.

Keep internal implementation details out of normal conversation unless they help me decide something. Detailed logs can live in an expandable technical view.

Make stop, pause, resume, and steering easy to reach. Distinguish stopping speech playback from cancelling a task, and cancelling a task from attempting to reverse completed work.

Use meaningful states such as "waiting for your PC," "needs account sign-in," "checking the result," or "ready for your decision." Avoid perpetual generic spinners.

Design notifications to be useful and quiet. Routine unchanged monitoring results should not generate repeated interruptions.

Explain accessibility, keyboard shortcuts, global invocation, tray behavior, and how the app remains usable while NEXUS is controlling another window.

## 10. Design voice, images, and screen understanding as integrated modalities.

Voice should support speech recognition, spoken responses, interruption, voice activity handling, and switching to text without losing the task. Separate conversation latency from long-running execution.

Start with a practical push-to-talk interaction. Describe an optional wake word and continuous-listening mode as later owner-controlled features. Specify recording indicators, audio retention, transcription correction, and handling of background speech.

An ambiguous transcription that changes a recipient, amount, address, or destructive instruction must be resolved before the affected action. A casual sound from a speaker or webpage must not become an authenticated owner command.

Images should support screenshots, photographs, diagrams, documents, and visual references. Distinguish image interpretation, OCR, image generation, and image editing as separate capabilities with different tools and costs.

For screen context, specify on-demand capture, selected-window capture, application accessibility trees, and screenshot retention. Identify when pixels are necessary and when structured application data is more reliable.

Do not describe visual estimates as exact facts when the image is unclear. For actions based on vision, explain coordinate mapping, display scaling, stale screenshots, multiple monitors, and verification after interaction.

The phone interface later should share task and conversation identity. Full control of other phone applications is a separate capability with platform-specific limitations, not an automatic consequence of having a phone interface.

## 11. Create a capability registry with real contracts.

Define the difference between a tool, connector, skill, workflow, plugin, worker, and model adapter. Use these terms consistently.

Every callable capability needs a machine-readable description: identifier, version, purpose, input schema, output schema, prerequisites, environment, authentication requirements, side effects, policy scopes, cost characteristics, rate limits, cancellation support, verification method, and known limitations.

Include capability health: installed, available, needs authentication, degraded, outdated, disabled, or unsupported on the current node. Availability is dynamic, not a permanent boolean.

The boss should discover relevant tools without loading thousands of tool definitions into every model request. Propose capability search, filtering, and selection that accounts for task intent and permission scope.

Distinguish a capability being installed from an action being authorized. Registering a tool must not give it unrestricted access automatically.

Define an error vocabulary shared by all tools: invalid input, missing permission, missing credential, unavailable device, unsupported operation, transient service error, rate limit, uncertain external effect, and verification failure.

Describe how tools added by generated code enter the registry and how they can be disabled immediately without deleting historical task evidence.

## 12. Design execution routing across APIs, browser, desktop, and shell.

Prefer the most reliable suitable method, typically a supported service API or application interface, then an SDK or CLI, then structured browser or application automation, and finally visual computer use when needed. Explain exceptions instead of treating the order as an absolute rule.

The router should evaluate reliability, permissions, current availability, speed, cost, account context, and ability to verify the result. It must preserve the intended scope when switching methods.

If an API route is denied or lacks authorization, a browser fallback must not be used to bypass that restriction. If an API is merely unavailable and the browser action is independently authorized and supported, a fallback may be legitimate.

The desktop and browser routes need explicit ownership of shared state. Prevent focus stealing, typing into the wrong application, races between tabs, accidental actions on stale elements, and interference with my own active use.

Specify a takeover and yield mechanism: NEXUS can pause when I move the mouse or request control, then resume from a fresh observation. Headless work should remain independent where possible.

For shell operations, use structured arguments and controlled environments. Account for process trees, timeouts, output size, working directories, secrets in logs, and commands that launch background children.

All execution methods should emit comparable evidence so the boss can reason about outcomes without relying on a success-shaped text response.

## 13. Make broad computer access explicit and technically honest.

I want NEXUS to be capable of working across my computer, not confined to a tiny demo folder. Design access to ordinary files, selected protected files when authorized, installed applications, application settings, package managers, terminal tools, development environments, and administrative operations where needed.

Separate breadth of capability from the privileges held by every process at every moment. Recommend a practical way to perform an authorized administrative operation without running the entire conversation interface and every downloaded plugin as administrator.

Explain the execution broker, the user-session helper, and any privileged helper. Show how an action is bound to the task, target resource, requested parameters, applicable rules, and authorization decision.

Be honest about enforcement boundaries. If arbitrary code runs with the same unrestricted privileges as the policy engine, it may be able to bypass or alter that engine. Do not claim hard protection from a prompt, a Python wrapper, or a log entry. Describe what actual process, account, filesystem, or OS isolation is needed for stronger guarantees.

Offer a usable default that supports broad owner-authorized work and an explanation of the tradeoffs of unrestricted raw execution. Do not silently redefine my request as a permanently read-only assistant.

Account for protected desktops, UAC, account-specific permissions, antivirus interactions, administrator-owned files, and applications that expose limited automation. Investigate supported routes; do not promise that broad access erases these boundaries.

## 14. Make browser control a first-class subsystem.

Support research, ordinary navigation, forms, downloads, uploads, logged-in application workflows, and task-specific browser sessions. Define how NEXUS selects the correct browser, profile, account, window, and tab.

Compare controlling an existing user browser session with using a dedicated automation profile. Explain convenience, login handling, interference with active browsing, reliability, and credential exposure. Make an explicit recommendation with a migration path.

Use structured page data and stable selectors when available. Describe fallback to screenshots and visual interaction when necessary. Re-observe after navigation, modal changes, reloads, and significant page mutations.

Maintain an action record for externally meaningful submissions. A click is not proof that a booking, payment, message, or upload succeeded. Verify through the resulting page, a service record, or another authorized observation.

Treat page text, hidden content, downloaded documents, and tool outputs as untrusted inputs. They can supply task data, but cannot become owner instructions merely because the boss read them.

Plan for login expiry, multiple accounts, two-factor challenges, CAPTCHA, popups, file pickers, browser updates, and closed tabs. State which conditions can be handled automatically and which need owner participation.

Avoid designing around exported browser cookies or hidden credential extraction. Prefer supported session and authentication mechanisms.

## 15. Design connectors and provider adapters without assuming shared entitlements.

Specify separate adapters for the boss model, Codex worker, Claude Code worker, speech recognition, speech synthesis, image tools, embeddings if used, and external services.

For Codex, research the current supported SDK, app-server, and non-interactive integration surfaces. For Claude Code, research programmatic CLI execution and the Agent SDK. Distinguish personal local usage from embedding a provider in a separate product.

Do not assume a ChatGPT or Claude subscription is a generic API credit balance. Do not assume that being signed into a desktop application automatically authorizes a background cloud service or grants access to every connector installed in that application.

Each adapter needs startup, authentication state, session creation and resume, streaming events, cancellation, timeouts, usage reporting, rate-limit handling, structured outputs, and error mapping.

Prefer supported subscription-backed routes where they fit. If an API-backed route is necessary, show why, where its charges appear, and how a fallback budget controls it. Never silently move a task from a subscription to unbounded paid usage.

For Google Drive and other accounts, design explicit account connections, OAuth scope selection, token refresh, revocation, and account selection. Keep document contents, account credentials, and provider-specific sessions separate.

Support adding future services without special cases scattered throughout the boss. A connector should advertise capabilities through the common registry and use the common policy, task, and evidence interfaces.

## 16. Make personal memory an application-owned system.

Do not implement memory as one enormous prompt file that grows forever and is loaded on every request. Give me a readable personal memory view, backed by structured storage and reliable retrieval.

Separate these categories:

1. Core identity and stable owner preferences.
2. Explicit owner rules and standing permissions.
3. Goals, projects, commitments, and open loops.
4. People, organizations, places, resources, and their relationships.
5. Facts and preferences that may change over time.
6. Episodic records of conversations and completed or failed work.
7. Procedural knowledge in skills and workflows.
8. Temporary working state for active tasks.
9. A separate credential store that is not general model memory.

State which store is authoritative for each category. If a database and editable Markdown files both exist, define how edits are imported, validated, versioned, and reconciled. Avoid two competing sources of truth.

Recommend a practical local storage foundation, such as a relational database with text search, readable exports, and optional semantic indexes. Explain whether vector search is needed at first, what it contributes, and what remains functional if the embedding provider is unavailable.

The assistant's memory should remain usable after a model switch or provider outage. A vendor's conversation history is not the sole record of my projects and commitments.

## 17. Specify memory records, relationships, and temporal meaning.

Provide example schemas for an owner profile, memory fact, preference, project, commitment, entity, relationship, conversation reference, experience record, and correction.

A memory record should consider:

- Stable identifier and schema version.
- Record type and normalized content.
- Owner, project, or task scope.
- Source event, document, or explicit user statement.
- Source trust category and sensitivity classification.
- Whether it was stated directly, observed, derived, or inferred.
- Confidence represented appropriately rather than as fake numerical precision.
- Created, observed, last verified, valid-from, and expiry times where relevant.
- Status such as active, disputed, superseded, expired, or deleted.
- Links to supporting evidence and contradictory records.
- Retention policy and whether it may leave the device.
- Correction and supersession relationships.

Distinguish "the user preferred morning meetings last year" from "the user currently prefers morning meetings." Distinguish a booking preference from a factual requirement and a one-time exception from a global rule.

Demonstrate how a statement such as "For this client only, use a formal tone" is stored without changing all future communication. Show how a later correction changes retrieval and invalidates stale derived summaries.

Do not build an elaborate knowledge graph without explaining the actual queries it enables. A relational entity-and-relationship model may be sufficient initially.

## 18. Design a context builder that remembers the right things.

Before planning or delegating, the context builder should assemble a compact, relevant context package. Explain the retrieval process step by step:

1. Identify the task, entities, project, and intended actions.
2. Load the compact core profile and applicable owner instructions.
3. Resolve relevant facts, preferences, commitments, and prior decisions.
4. Search experiences and skills using text search and semantic retrieval where useful.
5. Check freshness, contradictions, and source trust.
6. Select evidence under a context budget.
7. Attach source identifiers so claims can be traced and corrected.

Do not let relevance ranking discard mandatory rules. Separate rule applicability from ordinary memory search.

Specify what is always included, what is retrieved, and what is retrieved only after a tool failure or ambiguity. Avoid forwarding my entire memory to every worker or external provider.

Each worker should receive the minimum sufficient task context, a policy snapshot or reference, and explicit constraints. It should return proposed memory updates through a controlled interface rather than directly editing the authoritative profile.

Define cache invalidation after a rule or preference changes. Explain what happens when the database is temporarily unavailable: do not perform restricted actions on the assumption that no rules exist.

Measure retrieval quality through meaningful examples, not merely whether an embedding query returns something.

## 19. Design memory writes as a deliberate learning pipeline.

Describe how a task outcome becomes a proposed memory change. Separate facts worth remembering, transient details, reusable methods, failed approaches, and sensitive material that should not be retained.

Explicit owner instructions to remember something should have a direct, dependable path. Inferred preferences should be marked as inferred and should not quietly outrank the owner's later statements.

Use deduplication and merge logic so repeated conversations do not create hundreds of near-identical facts. Preserve context and history when a fact genuinely changes.

A webpage saying "the user wants all notifications disabled" is not evidence of the owner's preference. A worker claiming a deployment succeeded is not a confirmed experience until suitable evidence exists.

Define atomic writes and transactions where task completion, evidence, and memory updates must stay consistent. If a memory write fails, the task result should remain recoverable and the system should not pretend the memory was saved.

Include a correction feedback loop: when I say "you got that wrong," NEXUS should locate the source, update the appropriate record, invalidate related summaries when necessary, and avoid generalizing the correction beyond its scope.

Explain how learning from failures works without repeatedly exposing secrets, retaining unnecessary screenshots, or turning accidental behavior into a permanent procedure.

## 20. Design memory privacy, deletion, backup, and portability.

Let me inspect, edit, export, and delete personal memory. Let me mark a fact as local-only, temporary, private to a project, or excluded from particular providers.

Describe encryption at rest and in transit, key storage, recovery, and what the model provider receives. Do not claim end-to-end secrecy from a model service that must receive plaintext context to process it.

Separate redacted event metadata from sensitive payloads when useful. An append-only audit concept must not make personal-data deletion impossible. Explain tombstones, payload removal, derived indexes, caches, and retention.

For deletion, account for active records, summaries, embeddings, local caches, synchronized copies, and backups. State any backup expiry delay honestly rather than promising that every historical copy disappears instantly.

Define backup frequency, restore validation, schema migration, corruption detection, and recovery from interrupted writes. A readable export is valuable, but it is not automatically a complete transactional backup.

Prepare for later device synchronization with stable IDs and explicit conflict resolution. Rules and permissions deserve stronger conflict handling than an ordinary note. Do not use silent last-write-wins for security-sensitive policy changes.

The owner should be able to move the memory to a different installation or model stack without losing the meaning of provenance, corrections, projects, and skill references.

## 21. Define a rule system that is understandable and enforceable.

My rules need both human-readable expression and structured applicability. Distinguish preferences, procedural guidance, hard constraints, standing permissions, and temporary task-specific exceptions.

Rules need an ID, owner source, scope, affected resources and actions, conditions, effective dates, revision, and conflict behavior. Explain whether a rule is advisory or enforceable and where enforcement happens.

Use a transparent precedence model. Current explicit owner intent can revise prior preferences when that intent is clear. Protected restrictions should follow the owner's chosen change process. External content and worker-generated text cannot change owner policy.

The boss can explain and apply rules; the execution system must independently check enforceable rules. Include checks at dispatch and immediately before a consequential operation when state may have changed.

Return a meaningful reason when an action is denied. The system should identify the relevant owner rule or missing authorization, not produce a vague moralizing refusal.

Keep policy changes versioned and visible. A skill update must not smuggle in broader permissions. A core update must preserve or deliberately migrate existing owner policy.

Describe how a rule change reaches running workers and queued tasks. Pending actions using an old revision may need to be invalidated or re-evaluated.

## 22. Minimize repeated approvals while respecting actual scope.

Support standing permission, task-specific permission, and requests that fall outside existing scope. An explicit instruction to perform a concrete action should normally authorize the necessary steps within that action's stated boundaries.

Do not ask again just because an operation uses a different tool or crosses from planning into an already requested execution step. Ask when there is material ambiguity, a new cost or commitment, missing access, or a genuine expansion beyond what I authorized.

For actions needing a decision, prepare a concrete reviewable proposal first: target, recipient, amount, date, important terms, and expected effect. Explain why the decision is needed and whether the reason is my rule, an account requirement, or an unresolved ambiguity.

Design structured standing permissions, for example a bounded class of bookings or a specified notification recipient, without inventing my actual limits. Treat example monetary amounts as illustrative configuration, never as real authorization.

Represent authorization with the task, action parameters, policy revision, expiry, and resource scope. Detect a changed price, recipient, destination, or booking time after authorization and decide whether it still fits the authorized bounds.

Separate authority to read account data, modify private data, send communications, publish publicly, spend money, and alter access controls. These are different effects even when one website exposes them through similar buttons.

Revocation should stop future actions promptly. It cannot retroactively erase an operation already accepted by an external service.

## 23. Protect the owner boundary across tools and generated code.

The system will read websites, emails, files, code, repositories, documents, tool descriptions, and worker outputs. These can contain malicious or simply irrelevant instructions.

Specify a trust model that keeps owner commands separate from retrieved content. Show how tool results are labeled, how instructions embedded in documents are handled, and how a task remains bound to its authorized objective.

Credentials should be accessed through a narrow credential interface where practical. Models and workers should not receive raw tokens unless the integration genuinely requires it and the worker is authorized to handle them.

Protect logs, crash reports, screenshots, and command output from accidental secret retention. Include redaction limits: pattern matching alone is not perfect protection.

Generated code, installed dependencies, and imported skills need provenance, declared permissions, testing, and an activation process. Do not equate a package being popular or a repository having a familiar name with it being trustworthy.

Describe isolation for the development workshop and how promoted tools acquire only their declared execution permissions. Explain how an emergency stop, connector revocation, or skill disablement propagates.

Do not turn this section into a generic security checklist. Tie each boundary to a concrete component, data flow, and failure scenario in this assistant.

## 24. Build a durable task engine rather than relying on chat history.

Model tasks with a clear state machine. Consider accepted, needs clarification, planned, running, waiting for authentication, waiting for a device, waiting for quota, paused, verifying, completed, partially completed, failed, blocked, and cancelled.

Define legal transitions, who can initiate them, and what evidence is required. A model-generated sentence must not directly mark a task complete without checking its acceptance criteria.

Persist task plans, work orders, tool calls, relevant artifacts, checkpoints, resource ownership, and results. A restart should recover unfinished work from structured state.

For every externally meaningful action, track preparation, authorization, dispatch, acknowledgement, uncertain effect, observed effect, verification, and any compensating action.

Avoid claiming universal exactly-once execution across third-party systems. Use provider idempotency keys when available; otherwise use deduplication, reconciliation, and careful treatment of unknown outcomes.

If a booking request times out, do not automatically submit it again. Check whether the first request succeeded. The same principle applies to messages, payments, uploads, and document creation.

Specify retry policies by error class, with backoff, bounded attempts, and meaningful escalation. Repeatedly retrying an authorization error is not useful recovery.

Define pause versus cancellation, child-task cancellation, process-tree cleanup, and preservation of completed work. A cancelled task can still have completed side effects that must be reported.

## 25. Design scheduling, alarms, reminders, and monitoring correctly.

Scheduling must be a durable software function, not a language model remembering to wake up. Persist schedules with timezone, recurrence, owner intent, target capability, relevant rules, and delivery behavior.

Handle clock changes, daylight saving where applicable, missed runs, reboot, sleep, resume, and duplicate scheduler instances. Use the configured owner timezone; do not infer it from language, filenames, or a worker environment.

Differentiate an alarm, a reminder, a scheduled task, and a monitor. An alarm has timing and delivery requirements. A monitor compares observed state and notifies on meaningful changes. A scheduled task may perform work and produce an artifact.

Explain the limitations of local alarms when the PC is asleep, shut down, muted, or disconnected. Investigate supported wake and notification options, but do not promise delivery until the actual configuration is tested.

For monitors, define the observed source, polling or event mechanism, interval, rate budget, last-seen cursor, matching criteria, deduplication, quiet hours, and notification thresholds.

Support "only tell me when something important changes," batching low-priority updates, snoozing, escalation when a deadline is near, and a visible list of active monitors.

Recurring work must retain its original scope. Monitoring new jobs does not imply permission to submit applications; checking prices does not imply permission to purchase.

## 26. Coordinate resource use, concurrency, and recovery.

The system may have several tasks but only one shared desktop, one browser profile, or one mutable project folder. Define resource leases or locks with ownership, expiry, heartbeat, and recovery after a worker dies.

Use workspace isolation for independent coding tasks. When merging results, define conflict handling and verification. A worker should not overwrite unrelated user edits.

Use fencing or equivalent protection where stale workers could continue after a lease changes. Explain which guarantees can actually be enforced at the underlying tool or filesystem boundary.

A user correction, cancellation, or policy revision should invalidate pending work where appropriate. Merely changing the conversation summary does not stop a worker process.

Describe process supervision, child process cleanup, bounded output capture, and reconnect behavior. Include a strategy for identifying abandoned work and preserving recoverable artifacts.

Handle partial outages. If the boss model is unavailable, the interface, memory browsing, deterministic alarms, and already authorized deterministic jobs may have different availability characteristics.

Do not invoke an expensive model repeatedly just to poll a process. Use software events and state changes to decide when further reasoning is needed.

## 27. Define the skill system as procedural memory.

A skill is a reusable method for achieving a class of goals, with enough structure to execute, verify, and maintain it. It may reference tools, scripts, browser procedures, sub-workflows, or development instructions.

Every newly learned procedure should result in a draft skill or an improvement proposal for an existing skill. Reusing a known skill should update its execution evidence, not create a duplicate copy.

Separate learning a new method from memorizing a one-time parameter. Booking a meeting for Tuesday should not create a Tuesday-specific skill when a parameterized booking skill already exists.

Provide a skill package layout that includes a human-readable instruction file, machine-readable manifest, optional executable assets, test cases, dependency information, examples, and a changelog.

Define triggering, capability matching, parameter validation, prerequisite checks, permission requests, execution, verification, failure handling, and output interpretation.

Some skills should be deterministic workflows; others may need an agent to interpret current state. Explain how the system selects the right level of flexibility.

Support skill composition without requiring a model to rediscover the same sequence each time. Also support exploratory work when no skill yet exists.

## 28. Specify a detailed skill manifest and lifecycle.

Include at least the following fields in an illustrative manifest:

- Skill ID, name, description, version, author or generating task, and provenance.
- Goal patterns and explicit conditions under which it should not be used.
- Parameter schema, output schema, and expected artifacts.
- Supported environments, accounts, applications, and compatibility constraints.
- Required capabilities, packages, and configuration.
- Declared permissions and potential side effects.
- Execution strategy or procedure reference.
- Success criteria and verification method.
- Failure classes, recovery routes, and rollback or compensation limits.
- Tests, fixtures, validation evidence, and last successful run.
- Estimated resource and cost characteristics with uncertainty.
- Lifecycle status and reason for suspension or retirement.

Design lifecycle states such as draft, under test, validated, active, degraded, quarantined, superseded, and retired. Define promotion and rollback rules.

Do not promote a skill solely because its author says it works. Require appropriate evidence. For low-impact procedures, lightweight validation may be enough; consequential actions need stronger checks.

Skills should be discoverable by meaning, parameters, environment, and required permissions. Retrieval must exclude disabled or incompatible versions unless the purpose is repair.

Show how a task pins a skill version while allowing the system to learn about a newer version. A running task should not unexpectedly execute half of one version and half of another.

## 29. Design the full recursive learning loop.

Describe this loop in concrete terms:

1. Observe a request or a failure.
2. Classify what is missing: knowledge, data, tool, integration, authorization, environment, or reliability.
3. Search existing skills, tools, documentation, and prior attempts.
4. Form a proposed method and a measurable success condition.
5. Execute an authorized experiment or create a development work order.
6. Validate the result using suitable evidence.
7. Extract the reusable procedure and record limitations.
8. Create or improve a skill, tool, test, or routing rule.
9. Resume the original task.
10. Track later performance and detect regressions.

Describe how the system can improve the learning loop itself, for example by improving test generation, capability matching, failure diagnosis, or dependency selection. These meta-level changes still need validation and versioning.

Bound recursive depth, concurrent builders, token use, paid usage, wall-clock time, and retry count. Limits should be configurable and task-specific, not arbitrary fixed product ceilings.

Detect circular improvement chains: skill A requests builder B, which invokes skill A again. Detect repeated failure with no new evidence and avoid producing more code indefinitely.

Separate candidate lessons from accepted knowledge. Unverified output, a lucky success, or a worker's confident explanation should not become a trusted method.

## 30. Build a capability-gap resolver.

When a task cannot proceed, require a structured gap report containing the intended step, observed failure, current environment, attempted methods, relevant evidence, and the minimum missing capability.

The resolver should choose among alternatives: use an existing tool differently, repair authentication, retrieve missing data, ask a necessary question, use another authorized execution route, repair an existing skill, build a new tool, wait for availability, or report a genuine blocker.

Distinguish engineering failures from authorization failures. Do not commission a code generator to "solve" a missing user decision or a service restriction by bypassing it.

Before building, search the capability registry and prior development work. Avoid repeatedly creating connectors that already exist.

Estimate whether a new tool is worth building for the current task and for likely future reuse. A one-time task may justify a small temporary script; a repeated task may justify a supported connector.

Preserve the original task contract and link the development subtask to it. When the capability is ready, continue from the failed step with a fresh observation of the external state.

If the required capability cannot be completed within the current budget, preserve the work, explain the remaining requirement, and offer a practical alternative. Do not mislabel unfinished engineering as success.

## 31. Define the Codex and Claude development workshop.

Each development work order should include the concrete problem, expected inputs and outputs, environment constraints, available dependencies, permission boundaries, test requirements, budget, artifact location, and integration contract.

Use isolated workspaces or branches for development. Provide synthetic or minimized test data where possible. Do not hand every worker the entire personal memory or all account credentials.

Choose a worker based on capability, availability, account support, cost, and observed reliability. Allow an owner preference without hard-coding unsupported claims that one provider is always best.

For complex or consequential tools, a second worker may review the change independently. Explain the limits of model review; two agreeing models are not proof.

Define the handoff format between the boss and coding workers, including progress events, questions, patch or artifact references, test results, dependency changes, and remaining risks.

Validate the generated package against the capability interface and declared permissions. Scan for obvious secret handling mistakes and unexpected external communication. Use real behavior tests where appropriate.

The workshop must not modify the active boss or production skill directory in place while creating a candidate. Build, test, package, then activate through a controlled release path.

## 32. Design evaluation and skill promotion with independent evidence.

Specify tests at several levels: schema validation, deterministic unit tests, integration tests, simulated external effects, end-to-end user workflows, and limited live verification when later authorized.

Choose tests according to what can go wrong. Do not write superficial tests that merely restate the generated implementation. A test should be capable of exposing a plausible failure.

Use holdout examples where practical so a generated tool is not evaluated only against examples it was written to satisfy. Include negative cases, unavailable services, wrong account selection, and changed page structure.

For browser and desktop skills, test observations and postconditions, not only click sequences. A click sequence can complete while producing the wrong result.

For communications and bookings, test with mocks or test accounts before live use. A test run must not accidentally send real messages or create real purchases.

Promotion evidence should state what was tested, what remains untested, the environment, the version, and any limits on confidence.

Propose a small recurring regression suite for the core assistant and targeted tests for newly changed skills. Avoid rerunning an enormous suite on every trivial memory update.

## 33. Allow NEXUS to improve its own implementation.

Separate configuration changes, skill updates, connector updates, model-routing changes, UI changes, and core runtime changes. They have different risks and release requirements.

Let me change the assistant's name, tone, personality, preferred models, notification behavior, and default workflows without editing core code where possible.

Core self-improvement should be a versioned development project. The active system creates a candidate, tests it, checks compatibility with memory and policy schemas, packages it, and activates it under an owner-defined release policy.

Provide an update supervisor or equivalent recovery mechanism outside the component being updated. Otherwise a broken self-update may disable the very code needed to roll back.

Plan for database migrations, backward compatibility, interrupted updates, rollback limitations, and backup before irreversible schema changes.

The assistant cannot silently change its own authority, erase failure history to improve its score, disable verification, or redefine the success metric to make an update appear beneficial.

Measure improvements through reliability, completion quality, time, cost, owner corrections, and relevant task outcomes. Do not optimize a single number at the expense of the owner's actual goals.

## 34. Design proactive assistance around actual commitments.

NEXUS should suggest opportunities, notice unresolved commitments, help prioritize, and follow up on delegated work. It should be useful without constantly interrupting me.

Distinguish suggesting an action from executing it. Suggestions can be proactive; new external actions need current or standing authorization.

Specify sources for suggestions: project deadlines, scheduled events, explicitly monitored services, task history, owner goals, and connected data within scope. Avoid assuming continuous surveillance is necessary.

Use an attention model: urgency, relevance, likely usefulness, quiet hours, prior dismissals, and notification budget. Repeatedly ignored suggestions should affect future notification behavior without inventing a broad personality judgment.

Support an optional daily briefing, a concise "what needs my attention" view, and event-triggered alerts. Each suggestion should explain the relevant reason and link to evidence when useful.

Track commitments separately from casual conversation. "I might learn design someday" is not a deadline. "Remind me to submit this Friday" is an explicit commitment.

Make active monitors visible and individually editable. I should be able to say "stop watching this" and have the schedule, notifications, and related future actions stop.

## 35. Keep cost, latency, and compute under control.

Propose budget controls at owner, provider, task, worker, and development-project levels. Include limits for API spending, concurrent model calls, background monitors, image generation, speech processing, and long-running build jobs.

Distinguish actual billed usage, estimated usage, and unavailable usage data. Do not fabricate precise subscription costs per task when the provider does not expose them.

Use deterministic software for scheduling, routing rules, deduplication, status polling, and simple transformations when a model adds little value.

Use larger reasoning models for tasks that justify them, and simpler processing for routine steps, while preserving quality. Model choice should be replaceable and based on evidence rather than a hard-coded brand hierarchy.

Avoid passing excessive history to workers. Use compact context, retrieval, provider-supported caching where appropriate, and event-driven wakeups.

Define graceful behavior at quota limits: wait, use another authorized worker, use an approved API fallback, or present a clear choice. Do not create an endless cascade of paid retries.

For voice, separate fast acknowledgement from completion. NEXUS can acknowledge a task immediately and continue work asynchronously without pretending the task has finished.

## 36. Make completion, evidence, and observability first-class.

Every task should have a concise progress view and a traceable record of consequential actions. Record task IDs, action IDs, timestamps, resource targets, tool versions, policy revisions, outcomes, and artifact references.

Show useful explanations and decision summaries. Do not design the product around exposing hidden chain-of-thought or private internal model reasoning.

Define acceptable evidence by task type: a file that opens and contains the expected content, a booking confirmation from the service, a calendar event read back from the correct account, a message identifier, a tested application, or a verified alarm schedule.

A process exit code, screenshot, worker claim, and service confirmation provide different kinds of evidence. Explain their limitations instead of treating them as interchangeable.

Make uncertainty visible. If a remote action's outcome is unknown, show that state and reconcile it before retrying.

Define retention and redaction for traces. Debuggability should not require storing all personal content and credentials indefinitely.

Provide a troubleshooting view that answers: What was requested? What was authorized? What was attempted? What happened? What remains? Why is the system waiting?

## 42. Recommend a concrete technical stack and repository design.

Make one primary stack recommendation for a personal Windows application, then give a limited alternative where the tradeoff matters. Avoid a shopping list of every framework.

Evaluate the following design choices without assuming all are needed:

- A TypeScript or Python orchestration layer.
- A Windows desktop shell with a web-based UI or a native Windows interface.
- SQLite or another suitable local transactional database.
- Text search plus optional semantic retrieval.
- A narrowly scoped Windows integration helper where native APIs are useful.
- A browser automation adapter.
- Provider-specific worker adapters.
- A file-backed skill package format.
- A deterministic scheduler and event stream.
- A future authenticated coordinator-to-device protocol.

For each selected technology, explain the job it performs, why it fits the first release, deployment complexity, licensing or access considerations worth verifying, and its replacement boundary.

Minimize the number of programming languages, databases, and services unless there is a clear benefit. Do not add a vector database, message broker, Kubernetes cluster, or graph database merely because agent architectures sometimes use them.

Propose a repository tree with clear module responsibilities. Distinguish application source, runtime state, personal memory, credentials, skill packages, generated development workspaces, test fixtures, and artifacts.

The repository tree is a design artifact only. Do not create it yet.

## 43. Specify the interfaces and data contracts precisely.

Provide illustrative schemas for the central entities, using a consistent notation:

- Task and task revision.
- Plan step and worker work order.
- Tool invocation and tool result.
- Capability descriptor.
- Skill manifest and skill execution record.
- Memory fact and memory correction.
- Owner rule and authorization decision.
- Scheduled job and monitor cursor.
- Event and evidence record.
- Artifact reference.
- Device registration and capability advertisement.
- Resource lease.
- Improvement proposal and release record.

For each schema, identify required fields, stable IDs, versioning, lifecycle, ownership, and sensitive fields. Show how references connect records rather than duplicating large content everywhere.

Define the contracts between UI and coordinator, coordinator and workers, workers and execution broker, coordinator and memory, scheduler and task engine, and development workshop and skill registry.

Include structured errors, progress events, cancellation, timeouts, correlation IDs, and reconnection behavior. State which calls are synchronous, which create durable jobs, and which stream events.

Illustrate a policy check and an action result with hypothetical data. Show how a result carries evidence and uncertainty rather than a single boolean success flag.

Explain compatibility and migration when these contracts change. Avoid relying on free-form model prose as the only machine interface.

## 44. Plan milestones that preserve general capability from the beginning.

Do not propose a first release whose architecture is permanently limited to five hard-coded commands. Use milestones to manage engineering dependencies, not to shrink the product vision.

The earliest usable system should already have a general task loop, persistent memory and rules, broad tool routing, a development-worker path for missing capabilities, and durable execution history. Some integrations and refinements can arrive later.

A possible sequence is:

1. Architecture agreement and verification of critical integration assumptions.
2. The Windows foundation: interface, boss, durable tasks, owner rules, memory, and basic execution.
3. General capability expansion: browser, files, shell, selected service adapters, and initial coding-worker integration.
4. Learning built into ordinary execution: skill extraction, validation, registry, repair, and reuse.
5. Voice and visual interaction refinement, scheduling, monitoring, and proactive suggestions.
6. Stronger reliability, recovery, packaging, self-update, and daily use.
7. Phone access and an always-online coordinator where useful.

Reorder this if justified, especially if basic voice and image input can be included earlier. Keep the dependency reasoning explicit.

For every milestone, state the user-visible result, required modules, predecessor dependencies, acceptance evidence, and what remains incomplete. Provide effort ranges only if you explain assumptions; do not invent a confident delivery date.

Representative tasks are tests. A successful release must also handle a novel task through tool composition or the development path.

## 45. Include a substantial failure and acceptance matrix.

Provide expected behavior and verification methods for at least these scenarios:

| Scenario | What the design must establish |
|---|---|
| Restart during a task | Recover the correct state and preserve completed work. |
| Corrected preference | Use the new scoped fact in future tasks and active relevant work. |
| Owner rule changes mid-task | Re-evaluate pending actions and prevent stale authorization. |
| New unsupported task | Diagnose the gap and use the development path when appropriate. |
| Repeated known task | Reuse a skill instead of rediscovering the procedure. |
| Skill learns from a lucky success | Keep insufficiently validated generalizations out of trusted use. |
| Worker reports success incorrectly | Independent evidence prevents false completion. |
| Two workers edit one resource | Isolation or ownership prevents silent conflict. |
| User takes over the desktop | Automation yields and re-observes before resuming. |
| Wrong browser account is active | Account checks prevent acting in the wrong context. |
| PC is locked or offline | Queue or route work according to actual capability. |
| Subscription quota is exhausted | Apply a visible bounded fallback policy. |
| API request has an uncertain effect | Reconcile before retrying a consequential action. |
| Booking details change | Recheck against authorized bounds. |
| Malicious document includes commands | Treat them as data and preserve owner intent. |
| New skill requests broader access | Enforce the existing permission boundary. |
| Dependency installation fails | Preserve the task and explain the concrete missing prerequisite. |
| Alarm is missed during shutdown | Apply the defined missed-run behavior honestly. |
| Monitor sees no meaningful change | Stay quiet and update its cursor appropriately. |
| Owner cancels a monitor | Stop future runs and notifications. |
| Owner deletes memory | Remove or expire relevant active and derived records according to the stated retention policy. |
| Memory database is unavailable | Avoid executing as though no rules exist. |
| Core self-update fails | Recover through a tested rollback or repair path. |
| Generated tool tries to alter policy | Prevent or detect the action at the real enforcement boundary. |
| Voice input is misheard | Clarify consequential ambiguity before acting. |
| Image-based observation is uncertain | Seek a better observation or surface uncertainty. |
| Recursion makes no progress | Stop bounded attempts and preserve actionable diagnostics. |
| Cloud connection reconnects later | Avoid replaying expired or duplicate commands. |
| User asks for planning only | Produce a plan without implementation or external effects. |
| Model provider changes | Preserve memory, rules, task identity, and application behavior. |

Add important scenarios you discover. Identify which tests are deterministic, simulated, integration-level, or require an authorized real environment later.

## 46. Make tradeoffs, assumptions, and limits explicit.

Create a decision log with the decision, recommended choice, alternatives considered, rationale, consequences, and evidence still needed.

Cover at least local versus cloud ownership, desktop versus web interface, model provider strategy, subscription versus API usage, memory representation, skill execution style, permission enforcement, browser profile strategy, self-update mechanism, and the timing of phone support.

Separate fixed requirements from recommendations. If you disagree with a proposed implementation choice, explain why and offer a design that still meets the underlying requirement.

Treat "Claude Opus 5" as my requested target label for this prompt. Before implementation depends on a model identifier, verify its actual availability and supported interface. Do not invent specifications or silently substitute a different model.

List genuine engineering limits: model fallibility, unavailable devices, session requirements, external-service access, ambiguous authorization, irreversible effects, and finite budgets. Pair each important limit with a mitigation, fallback, or honest user-facing state.

Do not use these limits as an excuse to avoid designing general capability. Equally, do not erase them with claims that autonomous coding makes everything possible.

Distinguish capability limitations from implementation work remaining. A missing connector may be buildable; a service denying access is a different kind of constraint.

## 47. Produce these concrete architecture deliverables.

Your answer should contain a cohesive specification with the following deliverables:

1. A plain-language product definition that preserves the broad assistant vision.
2. A requirements table separating fixed requirements, proposed defaults, and unresolved choices.
3. A complete logical architecture diagram.
4. A Windows process and deployment diagram, including interactive-session boundaries.
5. A future phone/cloud extension diagram with ownership and synchronization explained.
6. A component responsibility table with inputs, outputs, state, dependencies, and failure behavior.
7. The boss and worker coordination model.
8. The task state machine and external-action state machine.
9. The memory architecture, schemas, retrieval flow, correction flow, and deletion behavior.
10. The rules, standing permissions, policy evaluation, and credential design.
11. The capability registry, tool routing, and connector strategy.
12. The skill format, lifecycle, learning loop, and capability-gap resolver.
13. The development workshop and controlled self-improvement release process.
14. The interface, voice, image, and screen-context design.
15. Scheduling, alarms, monitoring, and proactive assistance.
16. End-to-end worked scenarios connecting all of the above.
17. A recommended stack, repository structure, and integration contracts.
18. A dependency-aware build plan with acceptance evidence.
19. A failure matrix, evaluation plan, and observability design.
20. A decision log, source-verification notes, and a concise set of owner decisions.

Provide substantial detail where components interact. A long list of component names without protocols, state ownership, and failure behavior is not a complete architecture.

Keep terms, schemas, and diagrams consistent across sections. If you introduce a component, explain who operates it, what it stores, and how it communicates.

## 48. Use official sources to resolve changing integration details.

The following are starting points for verification, not a guarantee that any capability or entitlement is available on my account:

- For programmatic Codex integration, verify the current [Codex SDK documentation](https://learn.chatgpt.com/docs/codex-sdk) and [app-server documentation](https://learn.chatgpt.com/docs/app-server).
- For Codex account and billing distinctions, verify [authentication documentation](https://learn.chatgpt.com/docs/auth).
- For Claude Code automation, verify [programmatic usage](https://code.claude.com/docs/en/headless), [the Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview), and [authentication](https://code.claude.com/docs/en/authentication).
- For Windows service and desktop separation, verify [Microsoft's interactive-services documentation](https://learn.microsoft.com/en-us/windows/win32/services/interactive-services).
- For Windows application interaction, verify [UI Automation fundamentals](https://learn.microsoft.com/en-us/windows/win32/winauto/entry-uiautocore-overview).
- For Google Drive access, verify [the Drive API overview](https://developers.google.com/workspace/drive/api/guides/about-sdk) and [authorization scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).
- For Upwork monitoring, verify [automation guidance](https://support.upwork.com/hc/en-us/articles/43342677368467-Use-bots-and-other-automation-properly) and [developer access](https://www.upwork.com/developer).

Use primary documentation for factual integration claims. Record the date checked, the relevant claim, and whether it is confirmed, inferred, or still unverified. Cite sources close to the claims they support.

If a page has moved, find its official replacement. If you cannot verify a feature, design a replaceable adapter and mark the assumption instead of pretending it is established.

Do not let documentation research replace the architecture. Research enough to resolve critical feasibility and interface questions, then produce the complete design.

## 49. Review your own architecture against the owner's intent.

Before finalizing, check the following:

- Is this genuinely a general-purpose assistant rather than a narrow workflow menu?
- Is there one coherent boss while specialized work can be delegated?
- Are Windows, voice, images, broad computer access, and a real interface addressed?
- Can it handle an unfamiliar task through composition, exploration, or development?
- Does newly learned procedure become a skill or a revision of a skill?
- Is recursive improvement measurable, bounded, and capable of resuming the original task?
- Are memory and owner rules durable, inspectable, correctable, and independent of a model provider?
- Are mandatory rules enforced through actual execution boundaries?
- Does the plan avoid unnecessary repeated approvals?
- Are task status and external effects supported by evidence?
- Are broad access and self-modification described without false enforcement guarantees?
- Are subscriptions used where supported without pretending they cover every API?
- Is the local-only first release's availability described honestly?
- Is later phone and cloud support possible without discarding the foundation?
- Are sources, assumptions, and unresolved decisions clearly separated?
- Have you obeyed the architecture-only instruction?

Repair contradictions before presenting the result. Do not claim completeness merely because every heading has a paragraph.

Produce a traceability table mapping each major owner requirement to the responsible components, relevant contracts, and acceptance tests. This should make missing architecture visible.

## 50. Begin with a complete design proposal and a practical discussion path.

Start with your recommended architecture in plain language, then develop the detailed specification. Take a position on routine engineering choices rather than asking me to choose every library.

Where a decision genuinely depends on my preferences, make a clearly labeled proposed default and explain its practical effect. Reserve final questions for decisions that materially change cost, privacy, autonomy, or deployment.

Write for an owner who understands the intended behavior but may not know every engineering term. Explain technical concepts when they matter. Do not bury the central product experience under infrastructure jargon.

Be detailed enough that a competent engineer could estimate and begin implementing after we agree on the design. Be honest about which integrations still require account-level validation.

If your response cannot fit in one message, make the first part substantive, preserve a precise list of completed and remaining deliverables, and provide a clear continuation point. Do not label an incomplete architecture as finished or restart from the beginning on continuation.

End with the handful of decisions we should make next and the exact boundaries of the first implementation milestone. That milestone must establish the general assistant foundation, not redefine the product as five fixed automations.

Do not begin implementation. First give me the architecture and plan.