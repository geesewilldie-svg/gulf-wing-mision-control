# Installed local model metadata

In **Connection activity → Installed local models**, choose **Inspect installed local models**. The control is on demand: opening the page or disclosure does not query model tags. It reads only the fixed laptop-local Ollama `GET http://127.0.0.1:11434/api/tags` endpoint, with redirects rejected, a five-second request timeout and a 500 KB response limit. It sends no prompt and does not pull/delete models or change configuration.

The response distinguishes configured model, presence in the returned list, reported size/digest/modification time and check time. A bare configured name is compared with the default `:latest` tag. Other aliases are not guessed. Listed does not mean loaded, hardware-compatible, runnable or healthy for generation. Reported digests are not independently verified model-file hashes.

At most 1,000 reported entries are accepted and 100 valid unique model names displayed. Duplicates are collapsed, invalid names withheld and unknown size/digest/date fields remain unknown. Omitted/rejected counts make coverage explicit. Unrecognized responses, service/timeout errors and a configuration change during inspection produce a clean error. No fallback service is queried.

The controller-only same-origin POST accepts only `action: local-model-catalog`; arbitrary targets/extra fields are rejected. Results clear on a new attempt or access error, and the component unmounts when the parent activity view loses its authenticated status. Existing configuration polling does not run inference or catalog scans. Data stays on this controller/laptop path; provider enablement and per-question sharing rules remain unchanged.

This supplies discovery for the existing installed local runtime. It is not a Hub download connector, model installer, model-selection control, memory permission or performance benchmark. Venice, REA and asset acquisition retain their separate pending contracts.

The same bounded catalog now supports the separate one-answer selector in typed Local Ollama Answer settings. Catalog inspection itself remains read-only; see `nexus-local-model-choice.md` for request-local selection and its generation-time membership recheck.

An explicit [runtime detail inspection](nexus-local-model-details.md) is now available per displayed simple local model/digest. It checks current catalog identity around a bounded metadata request; it does not generate, import or change selection.
