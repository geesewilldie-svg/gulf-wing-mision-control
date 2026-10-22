"use client";
import { useEffect, useRef, useState } from "react";
import { SpeechBoundary, type ConversationTurn } from "@/lib/conversation";

export type AskConversation = (
  text: string,
  history: ConversationTurn[],
  signal: AbortSignal,
) => Promise<string>;
const aborted = () => new DOMException("Conversation stopped", "AbortError");
function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(aborted());
    const cancel = () => {
      clearTimeout(timer);
      reject(aborted());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, ms);
    signal.addEventListener("abort", cancel, { once: true });
  });
}

export default function NexusConversation({
  disabled,
  transcriptionReady,
  engine,
  voice,
  onAsk,
  onActive,
}: {
  disabled: boolean;
  transcriptionReady: boolean;
  engine: string;
  voice: SpeechSynthesisVoice | null;
  onAsk: AskConversation;
  onActive: (active: boolean) => void;
}) {
  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState("Microphone off");
  const [message, setMessage] = useState("");
  const [heard, setHeard] = useState("");
  const root = useRef<HTMLElement | null>(null);
  const session = useRef<AbortController | null>(null);
  const handlers = useRef({ onAsk, onActive });
  handlers.current = { onAsk, onActive };
  const mounted = useRef(true);
  const stop = (reason = "Conversation stopped. Microphone is off.") => {
    session.current?.abort();
    session.current = null;
    if (mounted.current) {
      setActive(false);
      setPhase("Microphone off");
      setMessage(reason);
    }
    handlers.current.onActive(false);
  };
  const stopRef = useRef(stop);
  stopRef.current = stop;
  useEffect(() => {
    mounted.current = true;
    const hidden = () => {
      if (document.hidden)
        stopRef.current(
          "Conversation stopped because the tab is hidden. Start it again when ready.",
        );
    };
    document.addEventListener("visibilitychange", hidden);
    const details = root.current?.closest("details");
    const collapsed = () => {
      if (details && !details.open && session.current) stopRef.current();
    };
    details?.addEventListener("toggle", collapsed);
    return () => {
      details?.removeEventListener("toggle", collapsed);
      mounted.current = false;
      session.current?.abort();
      session.current = null;
      handlers.current.onActive(false);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  useEffect(() => {
    if (disabled) stopRef.current();
  }, [disabled]);

  async function capture(signal: AbortSignal): Promise<Blob | null> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    if (signal.aborted) {
      stream.getTracks().forEach((track) => track.stop());
      throw aborted();
    }
    let context: AudioContext | undefined;
    try {
      context = new AudioContext();
      await context.resume();
    } catch {
      void context?.close().catch(() => {});
      stream.getTracks().forEach((track) => track.stop());
      throw new Error(
        "Audio monitoring could not start. Check microphone permissions.",
      );
    }
    if (signal.aborted) {
      stream.getTracks().forEach((track) => track.stop());
      await context.close();
      throw aborted();
    }
    const audioContext = context;
    return new Promise((resolve, reject) => {
      let media: MediaRecorder | undefined;
      let interval: ReturnType<typeof setInterval> | undefined;
      let done = false;
      const chunks: Blob[] = [];
      const cleanup = () => {
        if (interval) clearInterval(interval);
        signal.removeEventListener("abort", cancel);
        if (media) {
          media.onstop = null;
          media.ondataavailable = null;
          media.onerror = null;
          if (media.state === "recording") media.stop();
        }
        stream.getTracks().forEach((track) => track.stop());
        void audioContext.close().catch(() => {});
      };
      const finish = (blob: Blob | null, error?: Error) => {
        if (done) return;
        done = true;
        cleanup();
        if (error) reject(error);
        else resolve(blob);
      };
      const cancel = () => finish(null);
      signal.addEventListener("abort", cancel, { once: true });
      try {
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        const values = new Float32Array(analyser.fftSize);
        const detector = new SpeechBoundary(performance.now());
        media = new MediaRecorder(stream);
        media.ondataavailable = (event) => {
          if (event.data.size) chunks.push(event.data);
        };
        media.onerror = () =>
          finish(
            null,
            new Error(
              "Microphone recording failed. Check your input device and restart conversation.",
            ),
          );
        media.onstop = () =>
          finish(
            detector.heardSpeech && !signal.aborted
              ? new Blob(chunks, { type: media!.mimeType })
              : null,
          );
        stream.getAudioTracks().forEach((track) => {
          track.onended = () =>
            finish(
              null,
              new Error(
                "The microphone disconnected. Choose an input device and start again.",
              ),
            );
        });
        media.start();
        setPhase("Listening");
        interval = setInterval(() => {
          try {
            analyser.getFloatTimeDomainData(values);
            const rms = Math.sqrt(
              values.reduce((sum, value) => sum + value * value, 0) /
                values.length,
            );
            const boundary = detector.sample(rms, performance.now());
            if (boundary === "limit")
              finish(
                null,
                new Error(
                  "That turn reached 30 seconds. Start again and use a shorter question.",
                ),
              );
            else if (boundary && media?.state === "recording") {
              if (interval) clearInterval(interval);
              media.stop();
            }
          } catch {
            finish(
              null,
              new Error(
                "Audio monitoring failed. Check your microphone and start again.",
              ),
            );
          }
        }, 80);
      } catch {
        finish(
          null,
          new Error(
            "This browser could not record audio. Try Chrome or Edge on laptop localhost.",
          ),
        );
      }
    });
  }

  async function speak(text: string, signal: AbortSignal) {
    if (signal.aborted) throw aborted();
    if (engine === "device") {
      if (!window.speechSynthesis)
        throw new Error(
          "Device speech is unavailable. Choose a ready local voice.",
        );
      await new Promise<void>((resolve, reject) => {
        const utterance = new SpeechSynthesisUtterance(text.slice(0, 3000));
        utterance.voice = voice;
        utterance.rate = 0.95;
        let done = false;
        const finish = (error?: Error) => {
          if (done) return;
          done = true;
          signal.removeEventListener("abort", cancel);
          if (error) reject(error);
          else resolve();
        };
        const cancel = () => {
          window.speechSynthesis.cancel();
          finish(aborted());
        };
        utterance.onend = () => finish();
        utterance.onerror = () =>
          finish(
            signal.aborted
              ? aborted()
              : new Error(
                  "Speech playback failed. Check browser sound permissions.",
                ),
          );
        signal.addEventListener("abort", cancel, { once: true });
        window.speechSynthesis.speak(utterance);
      });
      return;
    }
    const response = await fetch("/api/sync/voice?action=speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, 3000), engine }),
      signal,
    });
    if (!response.ok)
      throw new Error(
        (await response.json()).error || "Speech generation failed.",
      );
    const blob = await response.blob();
    if (signal.aborted) throw aborted();
    const url = URL.createObjectURL(blob);
    const player = new Audio(url);
    try {
      await new Promise<void>((resolve, reject) => {
        let done = false;
        const finish = (error?: Error) => {
          if (done) return;
          done = true;
          signal.removeEventListener("abort", cancel);
          if (error) reject(error);
          else resolve();
        };
        const cancel = () => {
          player.pause();
          finish(aborted());
        };
        player.onended = () => finish();
        player.onerror = () =>
          finish(
            new Error(
              "Audio playback failed. Check Windows sound output and browser permissions.",
            ),
          );
        signal.addEventListener("abort", cancel, { once: true });
        void player
          .play()
          .then(() => {
            if (signal.aborted) player.pause();
          })
          .catch(() =>
            finish(
              new Error(
                "The browser blocked audio. Check site sound permissions and start conversation again.",
              ),
            ),
          );
      });
    } finally {
      player.pause();
      URL.revokeObjectURL(url);
    }
  }

  async function start() {
    if (session.current || disabled) return;
    if (
      !window.isSecureContext ||
      !navigator.mediaDevices?.getUserMedia ||
      !window.MediaRecorder ||
      !window.AudioContext
    ) {
      setMessage(
        "Conversation requires microphone access on localhost or HTTPS in a supported browser. Your phone's HTTP address cannot capture audio.",
      );
      return;
    }
    if (!transcriptionReady) {
      setMessage("Start the local voice worker and check local voice first.");
      return;
    }
    const controller = new AbortController();
    session.current = controller;
    setActive(true);
    handlers.current.onActive(true);
    setMessage("");
    setHeard("");
    const history: ConversationTurn[] = [];
    try {
      while (!controller.signal.aborted) {
        setPhase("Opening microphone");
        const audio = await capture(controller.signal);
        if (controller.signal.aborted) break;
        if (!audio || !audio.size) {
          await wait(300, controller.signal);
          continue;
        }
        setPhase("Transcribing");
        const response = await fetch("/api/sync/voice?action=transcribe", {
          method: "POST",
          headers: { "Content-Type": audio.type },
          body: audio,
          signal: controller.signal,
        });
        const transcript = await response.json();
        if (!response.ok)
          throw new Error(transcript.error || "Transcription failed.");
        if (controller.signal.aborted) break;
        const text =
          typeof transcript.text === "string"
            ? transcript.text.trim().slice(0, 2000)
            : "";
        if (!text) {
          await wait(300, controller.signal);
          continue;
        }
        setHeard(text);
        if (
          /^(?:nexus[, ]*)?(?:stop listening|stop conversation|mute(?: yourself)?)[.!?]*$/i.test(
            text,
          )
        ) {
          stop("Stopped by voice command. Microphone is off.");
          break;
        }
        setPhase("Thinking");
        const answer = await handlers.current.onAsk(
          text,
          history.slice(-4),
          controller.signal,
        );
        if (controller.signal.aborted) break;
        history.push(
          { role: "user", content: text.slice(0, 800) },
          { role: "assistant", content: answer.slice(0, 800) },
        );
        if (history.length > 4) history.splice(0, history.length - 4);
        setPhase("Speaking · microphone off");
        await speak(answer, controller.signal);
        setPhase("Getting ready to listen");
        await wait(450, controller.signal);
      }
    } catch (error) {
      if (!controller.signal.aborted)
        stop((error as Error).message || "Conversation stopped. Try again.");
    } finally {
      if (session.current === controller) stop();
    }
  }

  return (
    <section
      ref={root}
      className={`nexus-conversation ${active ? "is-active" : ""}`}
      aria-label="Hands-free conversation"
    >
      <h3>Talk with Nexus</h3>
      <p>
        Start once to automatically listen, transcribe, answer aloud and listen
        again. The microphone is off while Nexus thinks and speaks. Silence of
        about 1.4 seconds ends your turn.
      </p>
      <div className="nexus-buttons">
        <button
          onClick={() => void start()}
          disabled={disabled || active || !transcriptionReady}
        >
          Start conversation
        </button>
        <button onClick={() => stop()} disabled={!active}>
          Stop conversation / Mute
        </button>
      </div>
      <p role="status" aria-live="polite" className="conversation-phase">
        <span aria-hidden="true">{active ? "●" : "○"}</span> {phase}
      </p>
      {heard && <p>Last heard: {heard}</p>}
      {message && <p role="status">{message}</p>}
      <small>
        Microphone access starts only after your click. Say “stop listening” to
        end. Switching tabs or leaving this page stops conversation. Recent
        context stays in this session only; no background wake word.
      </small>
    </section>
  );
}
