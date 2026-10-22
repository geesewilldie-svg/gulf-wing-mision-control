"""Optional laptop-only voice worker. No model downloads or cloud calls.
Install dependencies, then set NEXUS_WHISPER_MODEL (existing local directory),
NEXUS_PIPER_MODEL (licensed .onnx voice with matching .json), and optionally
NEXUS_KOKORO_PYTHON / MODEL / VOICES for the resident Isabella engine.
The Next.js authenticated proxy is the only supported remote entry point.
"""
import io
import json
import os
import subprocess
import shutil
import tempfile
import queue
import threading
import atexit
from pathlib import Path
from http.server import BaseHTTPRequestHandler, HTTPServer

whisper = None
whisper_path = os.environ.get("NEXUS_WHISPER_MODEL", "")
piper_path = os.environ.get("NEXUS_PIPER_MODEL", "")
if whisper_path and Path(whisper_path).is_dir():
    from faster_whisper import WhisperModel
    whisper = WhisperModel(whisper_path, device="cpu", compute_type="int8", local_files_only=True)
piper_ready = bool(shutil.which("piper") and piper_path and Path(piper_path).is_file() and Path(piper_path + ".json").is_file())

class KokoroBridge:
    """Keep one CPU model resident; use the separate, already-installed venv."""
    def __init__(self):
        python = os.environ.get("NEXUS_KOKORO_PYTHON", "")
        model = os.environ.get("NEXUS_KOKORO_MODEL", "")
        voices = os.environ.get("NEXUS_KOKORO_VOICES", "")
        if not all(Path(p).is_file() for p in [python, model, voices] if p) or not all([python, model, voices]):
            raise RuntimeError("Kokoro paths are not configured")
        self.messages = queue.Queue()
        self.process = subprocess.Popen(
            [python, "-u", str(Path(__file__).with_name("kokoro_bridge.py"))],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, encoding="utf-8", env={**os.environ, "PYTHONIOENCODING": "utf-8"},
        )
        atexit.register(self.close)
        threading.Thread(target=self._read, daemon=True).start()
        try:
            if self.messages.get(timeout=90) != {"ready": True}:
                raise RuntimeError("Kokoro did not load")
        except Exception:
            self.close()
            raise

    def _read(self):
        for line in self.process.stdout:
            try:
                self.messages.put(json.loads(line))
            except ValueError:
                continue
        self.messages.put({"error": True})

    @property
    def available(self):
        return self.process.poll() is None

    def speak(self, text, output):
        if not self.available:
            raise RuntimeError("Kokoro stopped")
        self.process.stdin.write(json.dumps({"text": text, "output": str(output)}) + "\n")
        self.process.stdin.flush()
        try:
            if self.messages.get(timeout=90) != {"ok": True}:
                raise RuntimeError("Kokoro failed")
        except Exception:
            self.close()  # Never reuse a worker after an unknown/late reply.
            raise

    def close(self):
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait()


kokoro = None
if os.environ.get("NEXUS_KOKORO_PYTHON"):
    try:
        kokoro = KokoroBridge()
    except Exception:
        print("Kokoro could not start. Check its venv and model paths; Piper remains independent.")


def speech_engines():
    engines = []
    if kokoro is not None and kokoro.available:
        engines.append("kokoro")
    if piper_ready:
        engines.append("piper")
    return engines


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass  # Never log transcripts, prompts, or business records.

    def reply(self, status, data, content_type="application/json"):
        payload = data if isinstance(data, bytes) else json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path != "/health":
            return self.reply(404, {"error": "Unknown action"})
        self.reply(200, {"available": True, "transcription": whisper is not None, "speech": bool(speech_engines()), "engines": speech_engines(), "preferred": "kokoro" if "kokoro" in speech_engines() else "piper" if piper_ready else None, "profile": "Isabella · British English · 0.95" if "kokoro" in speech_engines() else None})

    def do_POST(self):
        # Browser sites cannot invoke the worker directly; no CORS or browser origins.
        if self.headers.get("Origin"):
            return self.reply(403, {"error": "Use the paired Mission Control proxy"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 8_000_000:
                return self.reply(413, {"error": "Invalid input size"})
            body = self.rfile.read(length)
            if self.path == "/transcribe" and whisper is not None:
                segments, _ = whisper.transcribe(io.BytesIO(body), vad_filter=True, beam_size=1)
                return self.reply(200, {"text": " ".join(s.text.strip() for s in segments)[:2000]})
            if self.path == "/speak":
                request = json.loads(body)
                if not isinstance(request, dict):
                    return self.reply(400, {"error": "Invalid speech request"})
                text = request.get("text", "")
                engine = request.get("engine", "kokoro" if "kokoro" in speech_engines() else "piper")
                if engine not in ["kokoro", "piper"]:
                    return self.reply(400, {"error": "Unsupported speech engine"})
                if engine not in speech_engines():
                    return self.reply(503, {"error": "Selected speech engine is unavailable"})
                if not isinstance(text, str) or not text.strip() or len(text) > 3000:
                    return self.reply(400, {"error": "Speech text must be 1–3,000 characters"})
                with tempfile.TemporaryDirectory() as directory:
                    output = Path(directory) / "speech.wav"
                    if engine == "kokoro":
                        kokoro.speak(text, output)
                    else:
                        subprocess.run(["piper", "--model", piper_path, "--length-scale", "0.9", "--sentence-silence", "0.08", "--output_file", str(output)],
                                       input=text, text=True, check=True, capture_output=True, timeout=90)
                    return self.reply(200, output.read_bytes(), "audio/wav")
            self.reply(503, {"error": "Requested local voice model is not configured"})
        except Exception:
            self.reply(503, {"error": "Local voice processing failed"})

if __name__ == "__main__":
    print("Nexus voice worker: laptop loopback only, port 8766. No wake-word listener.")
    HTTPServer(("127.0.0.1", 8766), Handler).serve_forever()
