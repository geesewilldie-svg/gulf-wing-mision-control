# Finish local Nexus assistant setup and diagnostics

The owner installed Ollama on Windows but terminal PATH updates and manual
configuration were causing repeated setup steps. `npm run ai:setup` now finds the
installed per-user executable, checks the loopback service, starts it if necessary,
downloads the small qwen2.5:1.5b model if missing and saves private runtime settings.
It does not install paid services, credentials or external agent adapters. Existing
model installations and reachable services are reused; failed downloads and bad
saved settings do not silently replace working configuration.

Nexus can read that private model choice at runtime, with the existing environment
variable retaining precedence. Auto remains document search without a configured
model. Context and output limits are bounded for the operator's 8 GB ASUS and the
local model unloads after two idle minutes. This does not establish hardware
latency, model accuracy or commercial readiness.

The confirmed Faster-Whisper/PyAV incompatibility remains fixed by the pinned
decoder. Voice worker errors now carry safe known codes; the authenticated proxy
maps those codes to actionable messages without relaying arbitrary worker text,
transcripts, private paths or traceback content. A running transcription worker is
no longer described as missing when its decoder fails.

Setup tests use synthetic Ollama responses and disposable files. Runtime checks
verify the setup-created configuration drives model answers without an environment
variable and that decoder errors survive the proxy as actionable instructions.
Actual Ollama installation, model download and performance on the user's laptop
must be verified there. No access to that laptop is available from this cloud
workspace. Instructions are in README.md.

Validation: production build and TypeScript passed. CI-mode browser regression:
102 passed and 8 intentional duplicate host cases skipped. Local setup fixtures
passed download, idempotence, invalid input and failed-download preservation checks.
Runtime fixtures confirmed persisted-model activation without an environment
variable and the actionable decoder message through the paired proxy. All 9 Python
worker tests and the real PyAV 15.1.0 PCM decode smoke test passed. No real model
was downloaded in cloud tests, and no Windows installer/launcher execution or
ASUS model latency was claimed. User-laptop activation remains a local step.
