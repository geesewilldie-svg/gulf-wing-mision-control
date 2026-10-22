"""Run with the installed voice venv; no models, microphone or network required."""
import io
import wave
import unittest
import av

class AudioCompatibilityTest(unittest.TestCase):
    def test_whisper_decoder_keyword_and_pcm_audio(self):
        audio = io.BytesIO()
        with wave.open(audio, "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(16000)
            output.writeframes(b"\x00\x00" * 1600)
        audio.seek(0)
        # Match Faster-Whisper's decoder call, including the removed PyAV keyword.
        with av.open(audio, mode="r", metadata_errors="ignore") as container:
            frames = list(container.decode(audio=0))
            self.assertTrue(frames)
            self.assertEqual(sum(frame.samples for frame in frames), 1600)

if __name__ == "__main__":
    unittest.main()
