# Optional local Nexus voice worker (Windows)

Device speech works without this worker when the browser provides speech synthesis.
Choose an installed voice in Nexus → Voice. Availability and quality depend on the
browser/Windows installation. A browser-managed voice can use a network service;
only voices labeled on-device indicate local service. No paid voice API is used.
This is not a clone of a performer and does not reproduce JARVIS exactly.

The optional worker provides local CPU speech recognition through Faster-Whisper
and local Piper speech output. The worker does not listen to the microphone by itself. Nexus now offers an explicitly started browser background conversation mode; see [background assistant setup](../../docs/background-assistant.md). No wake word is enabled. Actual
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

## Preferred voice: Kokoro Isabella

The selected Nexus voice is **Kokoro `bf_isabella`, British English, speed 0.95**.
The app's default **Preferred available voice** chooses Kokoro when the worker
reports it ready, then Piper, then device speech. Explicit selections are respected
for the current page session. A failed selected engine reports an error rather than
silently playing a different voice. Refresh resets the selector to Preferred.

Your existing separate environments are supported: `.venv-voice` runs Whisper and
Piper, while `.venv-kokoro` runs a resident Kokoro subprocess. The Kokoro model loads
once at startup, not once per answer. The subprocess has no network listener and
communicates with the worker over private pipes. The next app still uses the same
paired-controller voice proxy. No additional paid services or credentials.

For a fresh Kokoro environment (skip if already installed and auditioned):

```powershell
py -3.12 -m venv .venv-kokoro
.\.venv-kokoro\Scripts\python.exe -m pip install -r scripts/voice/requirements-kokoro.txt
```

Keep the downloaded files in:

```text
.gulf-wing/models/kokoro/kokoro-v1.0.onnx
.gulf-wing/models/kokoro/voices-v1.0.bin
.gulf-wing/models/whisper-tiny.en/   (optional transcription)
.gulf-wing/models/piper/en_GB-alba-medium.onnx   (optional fallback)
.gulf-wing/models/piper/en_GB-alba-medium.onnx.json
```

From a spare PowerShell tab in the repository, run:

```powershell
.\scripts\start-nexus-voice.cmd
```

This launcher uses installed models/environments only. It performs no downloads,
package installs or firewall changes. Leave both the app server and voice launcher
running. Wait for the worker's port-8766 startup message; model loading may take
time on the ASUS. The launcher does not stop an existing worker automatically.
If port 8766 is occupied, use Ctrl+C in the older voice-worker window first.

In Nexus, refresh the page, expand Voice, choose **Check local voice**, and leave
Speech engine on **Preferred available voice**. Current voice should show
**Isabella · British English · speed 0.95**. Speak voice preview / Speak answer
now requests Kokoro audio. Stop speech cancels playback. Select Local Piper or
Device speech explicitly to compare. Piper uses the auditioned length scale 0.9
and sentence silence 0.08. Windows chooses the actual speakers/TV audio output.

For custom paths, set `NEXUS_KOKORO_PYTHON`, `NEXUS_KOKORO_MODEL` and
`NEXUS_KOKORO_VOICES` before starting `worker.py` directly. Isabella and speed are
fixed to the approved profile in `kokoro_bridge.py`; no arbitrary voice names or
file paths are accepted from the browser. Kokoro's optional package/model licensing
is separate from Piper's. Review upstream licenses before redistributing Nexus.

Automatic protocol tests use synthetic audio/model fixtures, including two requests
through one resident model and exact Isabella/speed parameters. The owner auditioned
the actual model on Windows. End-to-end app playback, Windows launcher behavior,
latency and microphone recognition still require the local activation check.

## Faster-Whisper / PyAV compatibility repair

If transcription fails with `TypeError: open() got an unexpected keyword argument
'metadata_errors'`, Faster-Whisper's decoder is running against an incompatible
PyAV release. Faster-Whisper 1.2.1 passes this option; PyAV 19 no longer accepts it.
The voice requirements pin PyAV 15.1.0, which accepts it and has Windows Python 3.12
wheels. From a spare repository PowerShell tab:

```powershell
.\.venv-voice\Scripts\python.exe -m pip install "av==15.1.0"
.\.venv-voice\Scripts\python.exe scripts/voice/test_audio_compat.py
```

Stop the **voice-worker** tab using Ctrl+C, then restart
`.\scripts\start-nexus-voice.cmd` there. Restarting is necessary to unload the old
PyAV library from the running process. Leave the Next.js/Mission Control server
running. Refresh Nexus, check local voice, then retry Record question. The smoke
test decodes generated PCM audio without downloading or loading a speech model.
