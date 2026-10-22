# Connect Nexus to the approved Isabella voice

Nexus previously exposed only device speech and Piper, even though the owner had
installed and auditioned Kokoro. The owner selected `bf_isabella`, British English,
speed 0.95, for better clarity and a less mechanical delivery.

The optional worker now starts Kokoro in the existing `.venv-kokoro` Python
environment, keeps its model resident, and returns WAV audio through the existing
paired-controller proxy. Whisper/Piper stay in `.venv-voice`. Health advertises
available engines; Preferred selects Kokoro first, with Piper/device fallback when
Kokoro is unavailable. Explicit engine selections are respected; runtime failures
are reported instead of silently switching voices. Piper retains the auditioned
0.9 length scale and 0.08 sentence pause.

A Windows launcher finds the already-downloaded model files and starts the worker
without downloading, installing, changing the firewall, stopping other processes
or storing credentials. Voice model files and venvs remain ignored by Git.

Tests cover engine selection, explicit Piper selection, health, WAV responses,
unsupported/unavailable engines and resident-process reuse with exact Isabella
parameters. Model/audio protocol tests use fixtures; they do not replace local
quality, latency, speaker routing, or microphone checks. The user auditioned real
Kokoro audio separately and approved this profile. See scripts/voice/README.md for
activation after merging. No public deployment or automatic merge is included.

Validation: production build and TypeScript passed. Full browser suite: **102 passed,
8 intentional duplicate host-sync matrix cases skipped**. Python voice worker:
**8 passed**, including WAV generation with synthetic models and resident subprocess
reuse. Local-model/audio proxy protocol fixture checks passed. The voice selector
and Stop-during-preparation behavior passed on desktop and mobile. Desktop/mobile
screenshots with synthetic services show no page errors or horizontal overflow:
`docs/design/nexus-isabella-desktop.png` and `nexus-isabella-mobile.png`.
Actual Windows `.cmd` execution and app-to-speaker playback require local activation;
no real voice models were downloaded or executed in the cloud checks.
