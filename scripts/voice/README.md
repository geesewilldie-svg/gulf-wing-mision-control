# Optional local Nexus voice worker (Windows)

Device speech works without this worker when the browser provides speech synthesis.
Choose an installed voice in Nexus → Voice. Availability and quality depend on the
browser/Windows installation. A browser-managed voice can use a network service;
only voices labeled on-device indicate local service. No paid voice API is used.
This is not a clone of a performer and does not reproduce JARVIS exactly.

The optional worker provides local CPU speech recognition through Faster-Whisper
and local Piper speech output. No wake-word/background listener is enabled. Actual
latency, pronunciation and voice quality require testing on your ASUS hardware.
Python dependencies and models are optional, separate downloads; they are not
bundled in the Next.js app or installed by `npm ci`.

Use Python 3.12 in an isolated environment, from the repository in PowerShell:

```powershell
py -3.12 -m venv .venv-voice
.\.venv-voice\Scripts\python.exe -m pip install -r scripts/voice/requirements.txt
```

Obtain an existing Faster-Whisper-compatible model directory (for example a small
English model appropriate to your hardware), plus a licensed Piper `.onnx` voice
and its matching `.onnx.json` configuration. Review each model's license for your
commercial use. Piper is GPL software; distribution of a future Nexus product
requires a separate licensing review. Code licenses do not license every voice.

In the worker's PowerShell window, set your actual file paths:

```powershell
$env:NEXUS_WHISPER_MODEL = "C:\NexusModels\whisper-model-folder"
$env:NEXUS_PIPER_MODEL = "C:\NexusModels\licensed-voice.onnx"
$env:PATH = "$PWD\.venv-voice\Scripts;$env:PATH"
.\.venv-voice\Scripts\python.exe scripts/voice/worker.py
```

The worker binds **127.0.0.1:8766 only**. Do not expose it through a firewall rule
or router. Keep that terminal open. The app's `/api/sync/voice` proxy requires a
paired controller, validates origin and limits request size; phones never connect
to the worker directly. Imported instructions cannot invoke voice actions.

Open Nexus → Voice → **Check local voice**, choose Local Piper, then Speak voice
preview. Record question requests microphone permission, captures up to 30 seconds,
transcribes locally and puts editable text in the question box. You must review
and submit it yourself. Speech playback is explicit, with a Stop speech button.
Recordings/transcripts are not saved to the private knowledge index automatically.

Microphone capture requires localhost or HTTPS. Phone access over your current
plain HTTP LAN address does **not** support microphone capture; typed questions
and browser speech remain available where supported. HTTPS provisioning is future
work. Headphones can reduce speaker echo. No always-on or emotional-understanding
claims are made. Natural conversational quality requires a configured local model.

The worker protocol and failure paths were tested without models. Actual Whisper
recognition and Piper output still require model installation and hardware tests.
