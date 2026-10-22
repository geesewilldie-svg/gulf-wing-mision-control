"""Protocol/failure tests; no model download, audio inference or external service."""
import importlib.util
import json
import os
from pathlib import Path
import threading
import unittest
import urllib.request
import urllib.error

os.environ.pop("NEXUS_WHISPER_MODEL", None)
os.environ.pop("NEXUS_PIPER_MODEL", None)
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
            self.assertEqual(json.load(response), {"available": True, "speech": False, "transcription": False})

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

    def test_empty_body_is_rejected(self):
        with self.assertRaises(urllib.error.HTTPError) as result:
            urllib.request.urlopen(urllib.request.Request(self.base + "/speak", data=b""))
        self.assertEqual(result.exception.code, 413)

if __name__ == "__main__":
    unittest.main()
