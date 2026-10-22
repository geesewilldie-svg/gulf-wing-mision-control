"""Optional laptop-only voice worker. No model downloads or cloud calls.
Install dependencies, then set NEXUS_WHISPER_MODEL (existing local directory),
NEXUS_PIPER_MODEL (licensed .onnx voice with matching .json), and run this file.
The Next.js authenticated proxy is the only supported remote entry point.
"""
import io
import json
import os
import subprocess
import shutil
import tempfile
from pathlib import Path
from http.server import BaseHTTPRequestHandler, HTTPServer

whisper = None
whisper_path = os.environ.get("NEXUS_WHISPER_MODEL", "")
piper_path = os.environ.get("NEXUS_PIPER_MODEL", "")
if whisper_path and Path(whisper_path).is_dir():
    from faster_whisper import WhisperModel
    whisper = WhisperModel(whisper_path, device="cpu", compute_type="int8", local_files_only=True)
piper_ready = bool(shutil.which("piper") and piper_path and Path(piper_path).is_file() and Path(piper_path + ".json").is_file())

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
        self.reply(200, {"available": True, "transcription": whisper is not None, "speech": piper_ready})

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
            if self.path == "/speak" and piper_ready:
                text = json.loads(body).get("text", "")
                if not isinstance(text, str) or not text.strip() or len(text) > 3000:
                    return self.reply(400, {"error": "Speech text must be 1–3,000 characters"})
                with tempfile.TemporaryDirectory() as directory:
                    output = Path(directory) / "speech.wav"
                    subprocess.run(["piper", "--model", piper_path, "--output_file", str(output)],
                                   input=text, text=True, check=True, capture_output=True, timeout=90)
                    return self.reply(200, output.read_bytes(), "audio/wav")
            self.reply(503, {"error": "Requested local voice model is not configured"})
        except Exception:
            self.reply(503, {"error": "Local voice processing failed"})

if __name__ == "__main__":
    print("Nexus voice worker: laptop loopback only, port 8766. No wake-word listener.")
    HTTPServer(("127.0.0.1", 8766), Handler).serve_forever()
