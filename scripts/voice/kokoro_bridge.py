"""Resident Kokoro subprocess, isolated from the Whisper/Piper environment.
Private JSON-line protocol over stdin/stdout only; never a network listener.
"""
import json
import os
import sys

try:
    from kokoro_onnx import Kokoro
    import soundfile as sf
    model = Kokoro(os.environ["NEXUS_KOKORO_MODEL"], os.environ["NEXUS_KOKORO_VOICES"])
    print(json.dumps({"ready": True}), flush=True)
except Exception:
    print(json.dumps({"ready": False}), flush=True)
    sys.exit(1)

for line in sys.stdin:
    try:
        request = json.loads(line)
        text = request["text"]
        if not isinstance(text, str) or not text.strip() or len(text) > 3000:
            raise ValueError("Invalid text")
        audio, rate = model.create(text, voice="bf_isabella", speed=0.95, lang="en-gb")
        sf.write(request["output"], audio, rate)
        print(json.dumps({"ok": True}), flush=True)
    except Exception:
        print(json.dumps({"ok": False}), flush=True)
