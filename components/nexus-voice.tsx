"use client";
import { useEffect, useRef, useState } from "react";
type VoiceStatus = {
  available: boolean;
  speech?: boolean;
  transcription?: boolean;
  engines?: string[];
  preferred?: string | null;
  profile?: string | null;
};
export default function NexusVoice({
  answer,
  onTranscript,
  disabled = false,
}: {
  answer: string;
  onTranscript: (text: string) => void;
  disabled?: boolean;
}) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voice, setVoice] = useState("");
  const [backend, setBackend] = useState("auto");
  const [local, setLocal] = useState<VoiceStatus>({ available: false });
  const engines = local.engines ?? (local.speech ? ["piper"] : []);
  const effectiveBackend =
    backend === "auto"
      ? engines.includes("kokoro")
        ? "kokoro"
        : engines.includes("piper")
          ? "piper"
          : "device"
      : backend;
  const [message, setMessage] = useState("");
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const url = useRef<string | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const request = useRef<AbortController | null>(null);
  const stopSpeech = () => {
    request.current?.abort();
    window.speechSynthesis?.cancel();
    audio.current?.pause();
    if (url.current) {
      URL.revokeObjectURL(url.current);
      url.current = null;
    }
    setSpeaking(false);
    setMessage("");
  };
  useEffect(() => {
    mounted.current = true;
    const load = () => setVoices(window.speechSynthesis?.getVoices() ?? []);
    load();
    window.speechSynthesis?.addEventListener("voiceschanged", load);
    const check = new AbortController();
    fetch("/api/sync/voice", { signal: check.signal })
      .then((r) => r.json())
      .then(setLocal)
      .catch(() => {});
    return () => {
      mounted.current = false;
      check.abort();
      request.current?.abort();
      window.speechSynthesis?.removeEventListener("voiceschanged", load);
      window.speechSynthesis?.cancel();
      audio.current?.pause();
      if (url.current) URL.revokeObjectURL(url.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      if (timer.current) clearTimeout(timer.current);
    };
  }, [disabled]);
  const speak = async () => {
    stopSpeech();
    setMessage("");
    const text = (
      answer ||
      "Hello. I'm Nexus, your Gulf Wing business assistant. How can I help?"
    ).slice(0, 3000);
    if (effectiveBackend === "device") {
      if (!window.speechSynthesis) {
        setMessage("Device speech is unavailable in this browser.");
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice =
        voices.find((v) => v.voiceURI === voice) ??
        voices.find((v) => v.lang === "en-GB") ??
        null;
      utterance.rate = 0.95;
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => {
        setSpeaking(false);
        setMessage("Device speech could not finish.");
      };
      setSpeaking(true);
      window.speechSynthesis.speak(utterance);
    } else {
      const controller = new AbortController();
      request.current = controller;
      setSpeaking(true);
      setMessage("Preparing local speech…");
      try {
        const r = await fetch("/api/sync/voice?action=speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, engine: effectiveBackend }),
          signal: controller.signal,
        });
        if (!r.ok) throw new Error((await r.json()).error);
        const blob = await r.blob();
        if (controller.signal.aborted || !mounted.current) return;
        url.current = URL.createObjectURL(blob);
        const player = new Audio(url.current);
        audio.current = player;
        audio.current.onerror = () => {
          setSpeaking(false);
          setMessage(
            "Audio playback failed. Check your browser and Windows sound output.",
          );
          if (url.current) URL.revokeObjectURL(url.current);
          url.current = null;
        };
        audio.current.onended = () => {
          setMessage("Speech finished.");
          setSpeaking(false);
          if (url.current) URL.revokeObjectURL(url.current);
          url.current = null;
        };
        await player.play();
        if (controller.signal.aborted) {
          player.pause();
          return;
        }
        setMessage(
          effectiveBackend === "kokoro"
            ? "Speaking with Isabella · speed 0.95."
            : "Speaking with Piper.",
        );
      } catch (error) {
        if (mounted.current && request.current === controller) {
          setSpeaking(false);
          if (url.current) URL.revokeObjectURL(url.current);
          url.current = null;
          if ((error as Error).name !== "AbortError")
            setMessage((error as Error).message);
        }
      }
    }
  };
  const record = async () => {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    stopSpeech();
    setMessage("");
    if (
      !window.isSecureContext ||
      !navigator.mediaDevices?.getUserMedia ||
      !window.MediaRecorder
    ) {
      setMessage(
        "Microphone requires localhost or HTTPS and a supported browser. On your phone's HTTP address, use typed input.",
      );
      return;
    }
    setBusy(true);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (!mounted.current) {
        stream.current.getTracks().forEach((t) => t.stop());
        return;
      }
      const media = new MediaRecorder(stream.current);
      recorder.current = media;
      const chunks: Blob[] = [];
      media.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      media.onstop = async () => {
        stream.current?.getTracks().forEach((t) => t.stop());
        if (timer.current) clearTimeout(timer.current);
        if (!mounted.current) return;
        setRecording(false);
        setBusy(true);
        const controller = new AbortController();
        request.current = controller;
        try {
          const blob = new Blob(chunks, { type: media.mimeType });
          const r = await fetch("/api/sync/voice?action=transcribe", {
            method: "POST",
            headers: { "Content-Type": blob.type },
            body: blob,
            signal: controller.signal,
          });
          const data = await r.json();
          if (!r.ok) throw new Error(data.error);
          if (mounted.current) {
            onTranscript(data.text);
            setMessage("Transcript ready. Review it, then select Ask Nexus.");
          }
        } catch (error) {
          if (mounted.current && (error as Error).name !== "AbortError")
            setMessage((error as Error).message);
        } finally {
          if (mounted.current) setBusy(false);
        }
      };
      media.start();
      setBusy(false);
      setRecording(true);
      timer.current = setTimeout(() => {
        if (media.state === "recording") media.stop();
      }, 30000);
    } catch {
      setBusy(false);
      stream.current?.getTracks().forEach((t) => t.stop());
      setMessage("Microphone access was denied or unavailable.");
    }
  };
  return (
    <details className="nexus-voice">
      <summary>Nexus voice · Push to talk</summary>
      <p>
        No always-on listening. No voice cloning. Device voices vary; choose an
        installed British voice if available.
      </p>
      <label>
        Speech engine
        <select
          value={backend}
          onChange={(e) => {
            stopSpeech();
            setBackend(e.target.value);
          }}
        >
          <option value="auto">
            Preferred available voice — Isabella first
          </option>
          <option value="kokoro" disabled={!engines.includes("kokoro")}>
            Local Kokoro · Isabella · 0.95{" "}
            {engines.includes("kokoro") ? "ready" : "— setup required"}
          </option>
          <option value="device">Device speech (browser-managed)</option>
          <option value="piper" disabled={!engines.includes("piper")}>
            Local Piper{" "}
            {engines.includes("piper") ? "ready" : "— setup required"}
          </option>
        </select>
      </label>
      {effectiveBackend === "device" && (
        <label>
          Device voice
          <select value={voice} onChange={(e) => setVoice(e.target.value)}>
            <option value="">Automatic / British preferred</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
                {v.localService ? " · on-device" : " · may use network"}
              </option>
            ))}
          </select>
        </label>
      )}
      <p>
        Current voice:{" "}
        {effectiveBackend === "kokoro"
          ? "Isabella · British English · speed 0.95"
          : effectiveBackend === "piper"
            ? "Piper · local fallback"
            : "Browser/device voice"}
        . Automatic selection never switches a voice you explicitly chose.
      </p>
      <div className="nexus-buttons">
        <button onClick={speak} disabled={disabled || speaking}>
          Speak {answer ? "answer" : "voice preview"}
        </button>
        <button onClick={stopSpeech}>Stop speech</button>
        <button
          onClick={record}
          disabled={disabled || busy || !local.transcription}
        >
          {recording
            ? "Stop recording"
            : busy
              ? "Transcribing…"
              : "Record question"}
        </button>
      </div>
      <button
        onClick={async () => {
          try {
            const r = await fetch("/api/sync/voice");
            setLocal(await r.json());
          } catch {
            setLocal({ available: false });
          }
        }}
      >
        Check local voice
      </button>
      <p>
        Local transcription: {local.transcription ? "ready" : "not configured"}.
        Recording stops after 30 seconds. Nothing is submitted as a question
        automatically.
      </p>
      <p role="status">{message}</p>
    </details>
  );
}
