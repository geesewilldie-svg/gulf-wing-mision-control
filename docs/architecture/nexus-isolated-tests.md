# Isolated candidate tests — utility pilot

Foundation can run an accepted candidate's synchronous utility tests in QuickJS WebAssembly. This works with the existing Node 24+ application on Windows, Android/Chromebook controller browsers and Linux hosts. Execution happens on the laptop; browsers only request and display it. No Docker, Hyper-V, administrator access, cloud account, paid API or model invocation is needed. Install locked dependencies with `npm ci`; the runtime is pinned to MIT-licensed `quickjs-emscripten` 0.32.0. Retain installed TypeScript development dependencies for validation/transpilation.

## Owner flow

Validate the saved candidate, inspect its source and diagnostics, then accept that exact revision/hash for tests. Check **I approve one isolated test run of this exact candidate** and press **Run isolated tests**. Acceptance alone never queues a run. Existing accepted schema-3 reviews remain usable after migration. Results persist across reloads and show supplied test names, pass/fail counts, errors, engine and scope.

Passing means the candidate's supplied tests passed in this limited engine. It is not independent QA, full Node compatibility, a security certification, or permission to install/activate a skill. No automatic promotion, commits, merge or deployment occurs. The parent task stays waiting and the skill stays draft. Static validation reports remain historical records with tests not run at that stage; actual execution has a separate test-run record.

## Execution boundary and supported subset

Trusted host code transpiles candidate `.ts` files in memory using installed TypeScript without project plugins/configuration. Only the emitted JavaScript enters a new disposable QuickJS WebAssembly runtime inside a worker thread. Candidate source is never evaluated by host Node, `vm`, shell or `Function`. JavaScript `Function`/`eval` inside QuickJS remain inside that guest runtime.

The guest receives no host filesystem, network, process, credentials, environment, repository, Node imports or timers. Module loading is limited to virtual candidate-relative `.js` imports and trusted in-guest test/assert shims. It cannot install external packages. Host instruction files, Obsidian, business records and account settings are not passed in. A narrow typed host bridge formats numeric en-US USD values to two decimal places using the installed runtime's Intl data; it exposes no general host object or function evaluator.

Supported tests are synchronous `test(name, callback)` from `node:test` (default or named import), and a small `node:assert` / `node:assert/strict` shim: `equal`/`strictEqual` (strict Object.is comparison), `ok`, `fail`, and `throws` with an error class, regex matcher, or exact `name`/`message` object matcher. This shim is not full Node assert. Test roots are `tests/*.test.ts` or `*.spec.ts`, including subdirectories. Type-only `.d.ts` files are ignored. TSX/React, external packages, async tests, top-level await, nested tests, test contexts, timers, browser APIs, filesystem/network tests, full Node APIs and general Intl are unsupported. Missing imports, no tests, unsupported features, worker failure or exhausted budgets produce failure/error evidence, not a fabricated pass or a host-execution fallback.

The guest uses a 32 MiB QuickJS heap limit, 512 KiB stack limit, two-second interrupt deadline, maximum 50 tests and bounded names/messages. The outer worker has a ten-second deadline and V8 memory limits; terminating it also destroys its WASM runtime. This is engine isolation, not a separate OS user/VM and not a guarantee against implementation vulnerabilities in trusted dependencies. It is intended for this local utility pilot, not unrelated-customer multi-tenant code execution.

## Persistence, races and recovery

Controller authentication and same-origin checks apply. Each request confirms exact accepted review revision, task revision and content hash. Only one persisted running test is allowed at a time. Results check the latest review and current task again; changed artifacts/reviews produce stale evidence. Restart marks running attempts interrupted and never replays them. Active test records block task deletion; completed history is removed with the task, while backups retain their snapshots.

SQLite schema 4 adds `candidate_test_runs`. A schema-3 database is backed up before the additive migration. Prior tasks, reviews, memory and other business stores remain intact. Older app versions refuse the newer schema. Reports/notes are private data, not commands. Keep private backups; no automatic downgrade/restore is attempted.

Native Windows runtime loading, performance on the 8 GB VivoBook and the operator's exact saved artifact still require laptop acceptance. Default Turbopack CI is separate from the cloud environment's webpack build verification.

## Validation — November 7, 2026

Production webpack build and TypeScript passed. Full desktop/mobile regressions: 282 passed, 8 skipped. Final focused validation after error-object matcher support: 23 utility/review checks and 4 desktop/mobile UI/access checks passed. The operator's exact previously saved currency artifact was checked by hash and ran unchanged in this cloud workspace's WASM engine: four supplied tests passed, no installation. This is separate from laptop acceptance and independent QA. Launcher/connection checks and synthetic model/voice/setup protocols passed. Production dependency audit reported zero known advisories. No live model call or paid service was used. The default Turbopack CI check remains separate from this environment's successful webpack build.
