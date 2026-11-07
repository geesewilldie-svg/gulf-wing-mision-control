# Independent USD checks and inactive package staging

This delivery adds one explicit behavior contract, not a universal code reviewer or live self-updater. The first profile is `usd-format-v1`, version 1, for `src/format-currency.ts` exporting `formatCurrency(number)`. Unsupported candidates stay unverified and cannot be staged through this flow.

## Independent evidence

After static validation, owner review and passing supplied tests, the owner can confirm **Run independent verification**. The expected results in `lib/foundation/usd-contract.json` were written separately from the candidate. Fifteen cases cover zero, whole/fractional amounts, grouping, negative amounts, both rounding directions, positive/negative half cents, preserved negative zero, tiny positive/negative amounts, and RangeError for NaN and both infinities. The profile explicitly preserves negative zero according to this USD contract; it does not silently change the candidate's output policy.

Only candidate `src/` TypeScript enters a fresh QuickJS WebAssembly guest. Candidate test files and test/assert shims are not loaded. Trusted host code calls the exported function with numeric inputs, reads primitive string returns or error names plus a captured RangeError-prototype check, compares them to fixed host-side expectations and computes results outside the guest. Modifying guest JSON, assertions or prototypes cannot change those host comparisons. This detects sampled behavior defects, not every possible defect or deliberate case-specific implementation. The trusted Intl bridge/runtime remain shared dependencies, not independently certified implementations.

The existing no-files/no-network/no-process guest boundary, two-second interrupt limit, 32 MiB guest heap and ten-second outer worker deadline apply. No cloud model/account is invoked. Confirmation binds the current accepted review revision, task revision, artifact hash and latest passed supplied-test record. Commit checks those facts again. Restart interrupts unfinished verification without replay; stale results do not qualify for staging.

Each report carries the profile ID, version and SHA-256 of the exact contract. Staging requires the current fingerprint, expected count and passing state. Profile maintainers must increase its version when requirements change; replacing expectations under the same version does not make an earlier report current.

## Controlled promotion scope: inactive storage only

Use **Preview inactive package** after a current independent pass. The preview includes the actual candidate, task/scope, artifact hash, profile/version/fingerprint, evidence IDs, declared zero host permissions, a content-derived version and `inactive` lifecycle. Read it, then confirm **Stage inactive package**. The server recomputes the preview in a transaction and requires the exact preview hash. Revalidating, changing the task/artifact, running newer supplied tests or creating newer failed/changed verification invalidates old eligibility or preview approval.

Staging saves an immutable JSON manifest and hash in the private SQLite package ledger. It does not write candidate files into the repository, activate a skill, change pricing/estimates, execute a package, commit, merge or deploy anything. The task remains waiting and its skill stays draft. A separate [preview-approved isolated USD binding and rollback flow](nexus-utility-activation.md) can select this archive for a manual tool. General live plugin activation, repository application, independent security review and deployment remain future work. Do not describe this archive step as a live application upgrade.

The **Inactive utility packages** inventory remains available when tasks are paused/cancelled. **Revoke inactive package** updates its status with a revision check; it cannot change the archived code or reactivate a package. A task/hash/profile/version tuple can be staged only once, including revoked versions. Create a newly reviewed version instead of silently replacing an archive. Archived evidence may later become obsolete; no active capability is authorized by retaining an older package.

## Storage and access

SQLite schema 5 adds verification and inactive-package tables. Schema-4 installations get a consistent private backup before migration; prior tasks, accepted reviews and supplied test results are preserved. Existing business JSON stores are unchanged. Older app versions refuse a newer schema; do not downgrade by deleting the database.

Only paired Controllers can verify, preview, stage or revoke; same-origin checks apply. This remains trusted-household access, not customer/contractor tenant isolation. Active verification blocks task deletion. Deleting a task also removes its package/verification rows, while prior backups/exports may retain them. Package manifests are kept private; snapshots expose package metadata/hashes rather than copying source into every poll. Runtime/model credentials and owner memory are never inserted into manifests.

Native Windows acceptance remains necessary after installing the update. The cloud development workspace cannot update the operator's laptop directly.

## Validation — November 7, 2026

Production webpack build and TypeScript passed. The regression run completed with 304 passed and 8 skipped. After the final contract-fingerprint and error-type guards, 74 focused desktop/mobile checks passed across independent verification, inactive-package consent/revocation, supplied tests, static review, migration and recovery. A deliberately defective formatter passed its own supplied test but failed the independent boundary case; a forged error-name object failed the three invalid-number checks. The exact operator artifact was checked by hash and passed all 15 checks in the final cloud WASM verifier, unchanged. This does not record laptop verification or create an inactive package on that laptop. Connection/launcher and synthetic setup/model/voice checks passed. No live model request, paid service, live activation or native Windows acceptance is claimed; default Turbopack CI remains separate from this workspace's webpack build.

### Default build compatibility fix

The initial conditional worker filename failed Turbopack resolution on the operator's laptop. Worker selection now branches between two constructors with literal script paths, preserving the same data, limits and isolation. The module error was reproduced locally; after the fix and clearing this workspace's disposable cache from earlier denied builds, the default `npm run build` (Turbopack) passed. TypeScript and all six desktop/mobile review/verification/staging/access scenarios passed against that Turbopack production build. The existing default-build GitHub workflow now also runs on pushes to `feat/nexus-agent-router`; native Windows rebuild remains the next operator check. No schema, dependency or candidate changes are part of this fix.
