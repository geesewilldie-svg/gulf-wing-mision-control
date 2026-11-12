"use client";
import { useEffect, useRef, useState } from "react";
import NexusConversation, { type AskConversation } from "./nexus-conversation";
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
  section,
  onTranscript,
  onAsk,
  onConversationActive,
  disabled = false,
}: {
  onAsk: AskConversation;
  onConversationActive: (active: boolean) => void;
  section: string;
  answer: string;
  onTranscript: (text: string) => void;
  disabled?: boolean;
}) {
  const [cloudConsent, setCloudConsent] = useState(false);
  const [cloud, setCloud] = useState<{
    configured: boolean;
    enabled: boolean;
    supported: boolean;
    dailyCharacters: number;
    usedCharacters: number;
    warning?: string;
  } | null>(null);
  const refreshCloud = async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/sync/elevenlabs", { signal });
      if (!response.ok) throw Error();
      const value = await response.json();
      if (!signal?.aborted) setCloud(value);
    } catch {
      if (!signal?.aborted) setCloud(null);
    }
  };
  useEffect(() => {
    if (disabled) {
      setCloud(null);
      setCloudConsent(false);
      return;
    }
    const controller = new AbortController();
    void refreshCloud(controller.signal);
    return () => controller.abort();
  }, [disabled]);
  const [conversationActive, setConversationActive] = useState(false);
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
    if (!disabled)
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
  useEffect(() => {
    if (disabled || local.transcription) return;
    const controller = new AbortController();
    let pending = false;
    const timer = setInterval(() => {
      if (pending) return;
      pending = true;
      void fetch("/api/sync/voice", {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(4000)]),
      })
        .then(async (r) => {
          if (r.ok && !controller.signal.aborted) setLocal(await r.json());
        })
        .catch(() => {})
        .finally(() => {
          pending = false;
        });
    }, 8000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [disabled, local.transcription]);
  const speak = async () => {
    if (effectiveBackend === "elevenlabs" && !cloudConsent) {
      setMessage(
        "Allow cloud speech before using Stephanie. Text will be sent to ElevenLabs and paid credits may be used.",
      );
      return;
    }
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
      setMessage(
        effectiveBackend === "elevenlabs"
          ? "Preparing Stephanie cloud speech…"
          : "Preparing local speech…",
      );
      try {
        const r = await fetch(
          effectiveBackend === "elevenlabs"
            ? "/api/sync/elevenlabs"
            : "/api/sync/voice?action=speak",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              effectiveBackend === "elevenlabs"
                ? { text, cloudSpeechConsent: cloudConsent }
                : { text, engine: effectiveBackend },
            ),
            signal: controller.signal,
          },
        );
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
            : effectiveBackend === "elevenlabs"
              ? "Speaking with Stephanie · ElevenLabs."
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
    <>
      <NexusConversation
        section={section}
        disabled={
          disabled ||
          busy ||
          recording ||
          speaking ||
          (effectiveBackend === "elevenlabs" &&
            (!cloudConsent || !cloud?.enabled || !cloud?.supported))
        }
        transcriptionReady={Boolean(local.transcription)}
        engine={effectiveBackend}
        cloudSpeechConsent={cloudConsent}
        voice={
          voices.find((v) => v.voiceURI === voice) ??
          voices.find((v) => v.lang === "en-GB") ??
          null
        }
        onAsk={onAsk}
        onActive={(active) => {
          setConversationActive(active);
          if (!active && conversationActive) setCloudConsent(false);
          onConversationActive(active);
        }}
      />
      <details className="nexus-voice">
        <summary>Nexus voice · Push to talk</summary>
        <p>
          Listening starts only when you choose a recording or conversation
          control. No voice cloning. Device voices vary; choose an installed
          British voice if available.
        </p>
        <label htmlFor="nexus-speech-engine">Speech engine</label>
        <select
          id="nexus-speech-engine"
          aria-label="Speech engine"
          disabled={conversationActive}
          value={backend}
          onChange={(e) => {
            stopSpeech();
            setCloudConsent(false);
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
          <option
            value="elevenlabs"
            disabled={!cloud?.enabled || !cloud?.supported}
          >
            ElevenLabs · Stephanie ·{" "}
            {cloud?.enabled && cloud?.supported
              ? "configured · cloud"
              : "setup required"}
          </option>
          <option value="device">Device speech (browser-managed)</option>
          <option value="piper" disabled={!engines.includes("piper")}>
            Local Piper{" "}
            {engines.includes("piper") ? "ready" : "— setup required"}
          </option>
        </select>
        <details>
          <summary>ElevenLabs voice setup · Stephanie</summary>
          <p>
            Run Setup-Nexus-ElevenLabs.cmd on the Windows laptop. The hidden
            setup prompt protects your API key with Windows DPAPI. No key is
            entered in this browser.
          </p>
          <p>
            {cloud?.configured
              ? `Configured · ${cloud.enabled ? "enabled" : "disabled"} · ${cloud.usedCharacters} / ${cloud.dailyCharacters} characters reserved today (UTC; refresh for current usage).`
              : "Not configured or status unavailable."}
          </p>
          <p>
            Character limits apply to this Nexus installation, not a dollar
            spending cap. Account pricing, credits and voice eligibility are
            managed in ElevenLabs. Speech text leaves the laptop.
          </p>
          {cloud?.warning && <p>{cloud.warning}</p>}
          <button
            type="button"
            disabled={disabled}
            onClick={() => void refreshCloud()}
          >
            Refresh ElevenLabs status
          </button>
          <button
            type="button"
            disabled={disabled || !cloud?.enabled}
            onClick={async () => {
              window.dispatchEvent(new Event("nexus:voice-mute"));
              stopSpeech();
              try {
                const r = await fetch("/api/sync/elevenlabs", {
                  method: "DELETE",
                });
                if (!r.ok) throw Error();
                setCloud(await r.json());
                setCloudConsent(false);
                if (effectiveBackend === "elevenlabs") setBackend("auto");
                setMessage("ElevenLabs disabled for future speech requests.");
              } catch {
                setMessage(
                  "Could not confirm disabling ElevenLabs. Use Disable-Nexus-ElevenLabs.cmd on the laptop.",
                );
              }
            }}
          >
            Disable ElevenLabs
          </button>
        </details>
        {effectiveBackend === "elevenlabs" && (
          <label className="nexus-sharing">
            <input
              type="checkbox"
              checked={cloudConsent}
              disabled={disabled || conversationActive || speaking}
              onChange={(e) => setCloudConsent(e.target.checked)}
            />
            Allow cloud speech with Stephanie for this session. Spoken text,
            including private replies and morning briefs, goes to ElevenLabs and
            may use paid credits.
          </label>
        )}
        {effectiveBackend === "device" && (
          <label>
            Device voice
            <select
              disabled={conversationActive}
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
            >
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
              : effectiveBackend === "elevenlabs"
                ? "Stephanie · ElevenLabs · cloud"
                : "Browser/device voice"}
          . Automatic selection never switches a voice you explicitly chose.
        </p>
        <div className="nexus-buttons">
          <button
            onClick={speak}
            disabled={
              disabled ||
              speaking ||
              conversationActive ||
              (effectiveBackend === "elevenlabs" &&
                (!cloudConsent || !cloud?.enabled || !cloud?.supported))
            }
          >
            Speak {answer ? "answer" : "voice preview"}
          </button>
          <button onClick={stopSpeech} disabled={conversationActive}>
            Stop speech
          </button>
          <button
            onClick={record}
            disabled={
              disabled || busy || !local.transcription || conversationActive
            }
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
          Local transcription:{" "}
          {local.transcription ? "ready" : "not configured"}. Manual recording
          stops after 30 seconds and requires Ask Nexus. Conversation mode
          submits automatically while active.
        </p>
        <p role="status">{message}</p>
      </details>
    </>
  );
}
