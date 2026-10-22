"""Protocol/failure tests; no model download, audio inference or external service."""
import importlib.util
import json
import os
from pathlib import Path
import threading
import unittest
import urllib.request
import urllib.error
import wave
import sys
import tempfile
from unittest.mock import patch

os.environ.pop("NEXUS_WHISPER_MODEL", None)
os.environ.pop("NEXUS_PIPER_MODEL", None)
os.environ.pop("NEXUS_KOKORO_PYTHON", None)
spec = importlib.util.spec_from_file_location("worker", Path(__file__).with_name("worker.py"))
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

class VoiceProtocolTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = worker.HTTPServer(("127.0.0.1", 0), worker.Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def test_health_reports_missing_models(self):
        with urllib.request.urlopen(self.base + "/health") as response:
            self.assertEqual(json.load(response), {"available": True, "speech": False, "transcription": False, "engines": [], "preferred": None, "profile": None})

    def test_browser_origin_is_rejected(self):
        request = urllib.request.Request(self.base + "/speak", data=b'{"text":"hello"}', headers={"Origin": "https://example.com"})
        with self.assertRaises(urllib.error.HTTPError) as result:
            urllib.request.urlopen(request)
        self.assertEqual(result.exception.code, 403)

    def test_missing_local_models_fail_explicitly(self):
        for action in ["speak", "transcribe"]:
            with self.assertRaises(urllib.error.HTTPError) as result:
                urllib.request.urlopen(urllib.request.Request(self.base + "/" + action, data=b"fixture"))
            self.assertEqual(result.exception.code, 503)

    def test_kokoro_generates_wav_without_using_piper(self):
        class FakeKokoro:
            available = True
            calls = []
            def speak(self, text, output):
                self.calls.append(text)
                with wave.open(str(output), "wb") as audio:
                    audio.setnchannels(1)
                    audio.setsampwidth(2)
                    audio.setframerate(24000)
                    audio.writeframes(b"\x00\x00" * 240)
        model = FakeKokoro()
        with patch.object(worker, "kokoro", model):
            with urllib.request.urlopen(self.base + "/health") as response:
                health = json.load(response)
                self.assertEqual(health["preferred"], "kokoro")
                self.assertEqual(health["engines"], ["kokoro"])
            request = urllib.request.Request(self.base + "/speak", data=json.dumps({"text": "Hello Nexus", "engine": "kokoro"}).encode())
            with urllib.request.urlopen(request) as response:
                self.assertEqual(response.headers["Content-Type"], "audio/wav")
                self.assertTrue(response.read().startswith(b"RIFF"))
            self.assertEqual(model.calls, ["Hello Nexus"])

    def test_explicit_missing_engine_does_not_silently_fallback(self):
        with self.assertRaises(urllib.error.HTTPError) as result:
            urllib.request.urlopen(urllib.request.Request(self.base + "/speak", data=b'{"text":"Hello","engine":"kokoro"}'))
        self.assertEqual(result.exception.code, 503)

    def test_unsupported_engine_rejected(self):
        with self.assertRaises(urllib.error.HTTPError) as result:
            urllib.request.urlopen(urllib.request.Request(self.base + "/speak", data=b'{"text":"Hello","engine":"cloud"}'))
        self.assertEqual(result.exception.code, 400)

    def test_resident_bridge_keeps_one_model_and_uses_isabella_profile(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "model.onnx").touch()
            (root / "voices.bin").touch()
            (root / "kokoro_onnx.py").write_text(
                "import os\n"
                "class Kokoro:\n"
                " def __init__(self, *args):\n"
                "  with open(os.environ['NEXUS_TEST_LOADS'], 'a') as f: f.write('loaded\\n')\n"
                " def create(self, text, voice, speed, lang):\n"
                "  assert voice == 'bf_isabella' and speed == 0.95 and lang == 'en-gb'\n"
                "  return [0], 24000\n"
            )
            (root / "soundfile.py").write_text("def write(path, audio, rate):\n with open(path, 'wb') as f: f.write(b'RIFFfixtureWAVE')\n")
            env = {"NEXUS_KOKORO_PYTHON": sys.executable, "NEXUS_KOKORO_MODEL": str(root / "model.onnx"), "NEXUS_KOKORO_VOICES": str(root / "voices.bin"), "PYTHONPATH": directory, "NEXUS_TEST_LOADS": str(root / "loads.txt")}
            with patch.dict(os.environ, env):
                bridge = worker.KokoroBridge()
                try:
                    for index in range(2):
                        output = root / f"sample{index}.wav"
                        bridge.speak("Hello Nexus", output)
                        self.assertTrue(output.read_bytes().startswith(b"RIFF"))
                    self.assertEqual((root / "loads.txt").read_text().splitlines(), ["loaded"])
                finally:
                    bridge.close()
                self.assertFalse(bridge.available)

    def test_decoder_mismatch_reports_safe_actionable_code(self):
        class IncompatibleDecoder:
            def transcribe(self, *_args, **_kwargs):
                raise TypeError("open() got an unexpected keyword argument 'metadata_errors'")
        with patch.object(worker, "whisper", IncompatibleDecoder()):
            with self.assertRaises(urllib.error.HTTPError) as result:
                urllib.request.urlopen(urllib.request.Request(self.base + "/transcribe", data=b"test-recording"))
            self.assertEqual(result.exception.code, 503)
            body = json.load(result.exception)
            self.assertEqual(body["code"], "audio_decoder_incompatible")
            self.assertNotIn("test-recording", str(body))

    def test_empty_body_is_rejected(self):
        with self.assertRaises(urllib.error.HTTPError) as result:
            urllib.request.urlopen(urllib.request.Request(self.base + "/speak", data=b""))
        self.assertEqual(result.exception.code, 413)

if __name__ == "__main__":
    unittest.main()
