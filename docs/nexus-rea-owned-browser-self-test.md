# REA owned browser self-test

In Connection activity → REA inspection prerequisites, choose **Test REA owned browser inspection**. This is an explicit diagnostic, not a general website inspector.

Nexus checks the actual server Node runtime, creates a temporary browser profile and a random loopback-only HTML fixture, starts installed Chrome/Edge headless with an ephemeral loopback debugging endpoint, and creates a target for that fixture. The existing staged-package integrity gate and bounded MCP exchange then call `inspect_web_page` once. Acceptance matches the expected title, target ID, URL and origin, records the evidence identity/hash and capture completeness, and requires REA exit and browser cleanup. Personal browser profiles, existing tabs, external websites and models are not used. No browser is downloaded. The production browser keeps its normal sandbox settings.

The controller-only same-origin action accepts no URL, executable, profile, CDP endpoint or tool arguments. Capture enables accessibility text but disables console text, JSON body shapes, WebSocket shapes, storage keys/fingerprints and script sources. The whole fixture has a 30-second operation deadline; owned-process cleanup has additional bounded waits. Cleanup failure does not yield success and retains temporary files; an unclosed owned browser blocks another self-test until its close is observed. This is process ownership bookkeeping, not an operating-system process-tree sandbox guarantee.

Small metadata-only JSON receipts are created exclusively under the private Nexus data directory in `rea-self-test-receipts`, up to 100 files, with write/readback verification. Raw page content is not stored or added to owner memory. Receipt failure/full capacity is reported as pending independently of successful inspection; files are not automatically overwritten or pruned.

`policy_filtered` or `attach_limited` evidence is partial capture, not a complete page extraction or a security audit. General-site inspection, authenticated browsing, screenshots and arbitrary actions remain unconnected. Native Windows execution still needs host acceptance; cloud validation uses a disposable Chromium fixture with an internal test-only sandbox override, never a browser setting exposed by the HTTP API.

## Review saved runs

**View saved REA test history** reads the fixed local receipt slots without starting REA, launching a browser, checking packages or contacting a model. The controller-only same-origin action accepts no path or target. Newest 20 valid records are shown from the existing 100-slot store; counts distinguish valid, withheld and occupied slots. Missing history is an empty state, not a reason to launch a test. Unreadable, malformed, oversized or symbolic-link files are withheld, directory identity changes discard the read, and arbitrary files outside slots 0–99 are not enumerated.

The viewer projects only bounded known metadata fields. It does not expose raw receipt JSON, page content, file paths or unknown fields. Verified receipts require the recorded evidence ID/hash, runtime, capture status, one tool call and `generalSiteInspectionReady: false`; failed/cancelled receipts cannot inherit success evidence in the projection. These local records can be edited by someone with host file access, so a saved "verified" run is recorded history, not independent proof or current adapter readiness.

The visible history can be downloaded as JSON on the controller device without another server request. It contains only the displayed projection and coverage metadata. Reads/export do not change receipt bytes, prune old runs, expand tool access or add anything to owner memory. A failed or denied refresh clears the previous result in the viewer. At capacity, existing files are retained and later test receipt writes can remain pending.


Saved outcomes are now also available through **Show saved REA tests** in Auto/Local conversation. The assistant reuses the same projected history and explicit export controls, without starting REA/browser work or fetching history again automatically. Historical outcomes remain separate from current readiness. See [conversational saved-result review](nexus-conversation-rea-history.md).
