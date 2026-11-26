# Model configuration and response identity

Nexus now distinguishes configured request models from provider-reported response model metadata. In the request activity panel, **Configured inference models** shows each existing router adapter's configured ID and status. This is configuration only, not a live readiness/quota check. Loading or refreshing that panel sends no generation probe.

Successful routed answers expose **Model response details** beside the answer. Requested model is captured from the actual request configuration. Provider reported is the bounded `model` field for Ollama/OpenAI/Anthropic or `modelVersion` for Gemini in that response. Missing/invalid metadata remains **Not supplied**; it is never filled with the requested ID. A reported ID is an upstream claim, not independent identity verification, and may differ from an alias requested by the caller. Model names are accepted only as bounded identifiers, not arbitrary provider text or markup.

Identity is held per call and attached only to accepted text responses. Failed/cancelled calls do not acquire a success identity, and concurrent requests do not share a global last-model variable. Existing timeout, local inference slot, external allowance, Gemini Public exclusion, same-origin/controller, sharing and memory freshness checks remain governing. Reporting adds no model request or fallback. Existing planner callers still receive their text contract; this update does not persist model provenance on every historical task artifact.

Only supported existing adapters are represented. Venice/Hugging Face/REA remain planned connections under their own contracts. This feature does not enable provider accounts, choose/download a new model, change routing, expose credentials or guarantee model availability. Provider billing/quota checks still apply when an authorized inference request is actually made.

One-answer typed local model choices now retain their selected ID as the actual requested model in this response metadata; the saved default is not rewritten. See `nexus-local-model-choice.md` for the separately implemented local selector.
