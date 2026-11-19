# Planning context and completion checks

The November 19, 2026 phone-checklist walkthrough exposed a real quality failure: the local model called Nexus fictional, invented public sign-in behavior and ended mid-sentence, yet the stored task was completed. Artifact read-back/hash verification established storage integrity, not usefulness or factual correctness.

## Repair

The local planner now receives implemented Nexus capability facts: Windows host availability, Android installable Chrome client, private Tailscale HTTPS, pairing-code controller access, local/optional cloud voice, noise/interruption preferences, task boundaries and unimplemented integrations. These facts describe software capability, not current provider/account/device health. The prompt asks for a concise finished plan with expected results, at most 250 words and normally 5–8 steps. Planning uses a 768-token generation ceiling; chat remains at 256. Existing local concurrency and timeout bounds remain in place, with no cloud fallback or automatic retry.

The local planning adapter requires `done: true` and `done_reason: stop`. Limit-reached, incomplete/missing completion metadata or overlong output produces an incomplete-draft result. The coordinator preserves its partial text as a waiting planning task with a specific review reason, not a completed task. Drafts do not create a reusable skill or authorize execution. Objective/policy revision checks still prevent a cancelled or stale task from receiving a late draft.

Small deterministic checks also flag the observed positive “Nexus is fictional/hypothetical” claim in Nexus-specific plans and unfinished fenced code blocks. These checks are deliberately limited; they are not a semantic verifier, a guarantee of factual accuracy, or a replacement for reviewing the artifact against the actual product. A normal model stop signal is not proof that every instruction is useful or true.

Previously saved artifacts are retained unchanged. Do not treat this patch as retroactive acceptance of the bad checklist. After deployment, create a fresh planning task, queue it, inspect its state and output, and compare the checklist with the real Android setup. If it waits for review, inspect the reason rather than repeatedly queueing the same incomplete result. Improve/correct the objective before a new attempt when appropriate.

## Verification

Production build and 56 planner/Foundation/provider/steering regression checks passed using synthetic responses. Eight focused checks then passed for the final positive-completion-signal gate, request context/budgets, retained invalid/incomplete drafts, and cancellation safety. No real model inference or account access was used by these fixtures. A fresh useful checklist on the owner's laptop remains an acceptance step.
