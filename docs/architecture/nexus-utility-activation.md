# Controlled isolated USD activation and rollback

This increment makes an archived USD package usable through a manual tool inside Foundation. It does not install generated Node code, rewrite repository files, change estimates/accounting/payments, merge or deploy a new application. The first supported capability remains the fixed `usd-format-v1` contract. Existing packages remain unselected after migration until a Controller approves activation.

## Operator flow

Open Foundation → **Utility packages and activation** and choose **Utility workspace**. A package must belong to that workspace. Choose **Preview isolated activation**, inspect the selected package/manifest hash, current binding revision, previous package and effect/permission summary, then confirm **I approve this exact isolated activation** and select **Activate isolated USD utility**.

Activation changes one revisioned binding per workspace and profile. **Format USD** invokes the selected package on demand in a fresh, source-only QuickJS WebAssembly guest. Enter a plain finite decimal amount such as `1234.50`; decimal strings preserve negative zero. With no selected package, the same tool explicitly uses the trusted built-in formatter. Its result identifies which source was used. Other business screens and AI responses do not automatically use this new capability.

**Roll back to previous package** restores the preceding eligible package. If the last activation replaced the built-in formatter, the rollback button returns to that baseline. Rollback clears the previous pointer rather than silently toggling versions. **Disable isolated utility** always clears both pointers without needing the selected package's proof to be valid. Returning from a disabled state requires a fresh activation preview/approval. These actions are revision checked; stale tabs cannot overwrite a newer selection.

**Revoke inactive package** refers to the immutable archived package, whose original lifecycle remains `inactive`. The archive is never rewritten as executable host code. Revocation also clears any active binding or rollback target that references it. The separately displayed binding is the authority for whether isolated execution is selected. In-flight guest calls can take up to their fixed deadline to stop; their output is discarded if their binding/proof changes. No claim of immediate process termination is made by revocation or disable.

## Runtime and evidence checks

Activation and every invocation verify manifest and candidate hashes, workspace, fixed profile ID/version/fingerprint, zero host permissions, original accepted review/static result, pinned supplied tests and independent verification. Newer non-passing evidence or a new unaccepted/rejected review for the exact artifact blocks use. Changing or pausing a parent draft does not replace an already archived version with new code. A different candidate's failed tests do not substitute for, or erase, the active archive's identity.

The guest receives candidate `src/` files and one numeric amount, not business records, owner memory, credentials, filesystem/network APIs, timers or shell access. Candidate source is transpiled as data and runs only in WebAssembly. The same 32 MiB guest heap, 512 KiB stack, two-second interrupt and ten-second outer deadline apply. Every returned string is additionally checked against the trusted per-input USD formatter before display. Guest errors, timeouts or mismatches return no candidate value and do not silently run another package or switch versions. The owner can disable or roll back to recover. This utility-specific check is not a general verification method for future arbitrary skills.

Only one guest execution/test/verification lane is allowed at a time. Static compilation is separate. After execution, the server checks binding revision, selected package and proof again before returning output. Stale, revoked or interrupted results are discarded. Planning/coordinator dispatch policy is distinct from this manually requested utility; disable its binding to stop future candidate invocations. No background job invokes the selected package merely because the app starts.

## Storage, recovery and limits

SQLite schema 6 adds workspace/profile bindings, binding history and call outcome metadata. Schema-5 databases get a private consistent pre-migration backup. Existing archives, hashes, reviews, tests and other business stores are preserved. Older applications refuse the new schema; do not delete the database to downgrade.

Restart preserves explicit selections, marks unfinished calls interrupted and never replays them. Binding history records activation, rollback, disable and package revocation. Utility call records keep outcome/source/hash metadata, not entered amounts or formatted values. Responses remain browser-local. Task deletion is blocked while its packages are active, retained as rollback targets or executing; disabling/revoking first makes removal deliberate. Existing backup snapshots can retain earlier records. Restoring an old backup is not proof that a previously revoked selection should be trusted; inspect/disable restored bindings before resuming use. There is no automated restore supervisor.

Controller authentication and same-origin protections apply to preview, activation, changes and calls. Scope separates utility selections, not customer authentication: this remains the trusted-household prototype. No broader tenant isolation, full Node execution, generic plugin activation, arbitrary PowerShell or automatic business changes are introduced. Engine isolation relies on trusted dependencies and is not an OS VM security guarantee.

Native Windows activation/rollback acceptance remains necessary after installing this increment. The cloud development workspace cannot change the operator's running laptop directly.

## Validation — November 7, 2026

The default production Turbopack build and TypeScript passed. Full desktop/mobile regressions: 330 passed, 8 skipped. The final six UI/access checks also passed after the task-status display correction. Coverage includes preview-bound approval, isolated per-input formatting, reload persistence, first-activation rollback to baseline, two-version rollback, revocation of active/rollback targets, workspace boundaries, stale requests/output, tampered or unaccepted evidence, a defect outside sampled cases, safe disable, deletion guards, migration backups and interrupted-call recovery. Connection/launcher and synthetic setup/model/voice protocol checks passed. No live model use, repository application, actual laptop activation or broader plugin/tenant readiness is claimed by cloud tests.
