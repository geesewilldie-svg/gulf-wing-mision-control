"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

function startAudio(operation: Promise<void>, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      void operation.catch(() => {});
      reject(aborted());
      return;
    }
    const cancel = () => finish(aborted());
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            "Audio did not start. Check browser microphone and sound permissions, then start again.",
          ),
        ),
      8000,
    );
    const finish = (error?: Error) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      if (error) reject(error);
      else resolve();
    };
    signal.addEventListener("abort", cancel, { once: true });
    void operation.then(
      () => finish(),
      (error) => finish(error),
    );
  });
}

export default function NexusConversation({
  disabled,
  section,
  transcriptionReady,
  engine,
  voice,
  onAsk,
  onActive,
}: {
  disabled: boolean;
  section: string;
  transcriptionReady: boolean;
  engine: string;
  voice: SpeechSynthesisVoice | null;
  onAsk: AskConversation;
  onActive: (active: boolean) => void;
}) {
  const preferenceKey = "gulf-wing.nexus-auto-listen.v1";
  const [autoResume, setAutoResume] = useState(false);
  const [preferenceLoaded, setPreferenceLoaded] = useState(false);
  const [preferenceNotice, setPreferenceNotice] = useState("");
  const autoAttempted = useRef(false);
  const autoProbe = useRef<AbortController | null>(null);
  const autoRequested = useRef(autoResume);
  autoRequested.current = autoResume;
  const anotherActive = useRef(false);
  const autoStart = useRef<() => Promise<void>>(async () => {});
  const [background, setBackground] = useState(false);
  const backgroundRef = useRef(false);
  const previousSection = useRef(section);
  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState("Microphone off");
  const [message, setMessage] = useState("");
  const [heard, setHeard] = useState("");
  const root = useRef<HTMLElement | null>(null);
  const ownership = useRef<BroadcastChannel | null>(null);
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
  const remember = (value: boolean) => {
    autoRequested.current = value;
    if (!value) autoProbe.current?.abort();
    setAutoResume(value);
    autoAttempted.current = false;
    try {
      localStorage.setItem(preferenceKey, value ? "enabled" : "disabled");
      setPreferenceNotice("");
    } catch {
      setPreferenceNotice(
        "This browser could not save the listening preference. It applies to this page only.",
      );
    }
  };
  const mute = () => {
    remember(false);
    stop("Muted. Automatic listening is off for this device.");
  };
  const muteRef = useRef(mute);
  muteRef.current = mute;
  useEffect(() => {
    try {
      setAutoResume(localStorage.getItem(preferenceKey) === "enabled");
    } catch {
      setPreferenceNotice(
        "Saved listening settings could not be read. Start listening manually.",
      );
    }
    setPreferenceLoaded(true);
    const changed = (event: StorageEvent) => {
      if (event.key === preferenceKey && event.newValue !== "enabled") {
        autoProbe.current?.abort();
        setAutoResume(false);
        autoAttempted.current = true;
        stopRef.current("Muted from another Nexus window. Microphone is off.");
      }
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  const stopRef = useRef(stop);
  stopRef.current = stop;
  useEffect(() => {
    mounted.current = true;
    const hidden = () => {
      if (document.hidden && session.current && !backgroundRef.current)
        stopRef.current(
          "Conversation stopped because the tab is hidden. Start it again when ready.",
        );
    };
    document.addEventListener("visibilitychange", hidden);
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel("gulf-wing-nexus-conversation");
      ownership.current = channel;
      channel.onmessage = (event) => {
        if (event.data === "probe-active" && session.current)
          channel.postMessage("active");
        if (event.data === "active") anotherActive.current = true;
        if (event.data === "started" && session.current)
          stopRef.current(
            "Another Nexus window started a conversation. This window is muted.",
          );
      };
    }
    const leaving = () => stopRef.current();
    window.addEventListener("pagehide", leaving);
    const muteKey = (event: KeyboardEvent) => {
      if (
        event.ctrlKey &&
        event.altKey &&
        event.code === "KeyM" &&
        (session.current || autoRequested.current)
      ) {
        event.preventDefault();
        muteRef.current();
      }
    };
    document.addEventListener("keydown", muteKey);
    const details = root.current?.closest("details");
    const collapsed = () => {
      if (details && !details.open && session.current && !backgroundRef.current)
        stopRef.current();
    };
    details?.addEventListener("toggle", collapsed);
    return () => {
      ownership.current?.close();
      ownership.current = null;
      details?.removeEventListener("toggle", collapsed);
      mounted.current = false;
      session.current?.abort();
      session.current = null;
      handlers.current.onActive(false);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", leaving);
      document.removeEventListener("keydown", muteKey);
    };
  }, []);
  useEffect(() => {
    if (disabled) stopRef.current();
  }, [disabled]);

  useEffect(() => {
    if (
      previousSection.current !== section &&
      session.current &&
      !backgroundRef.current
    )
      stopRef.current();
    previousSection.current = section;
  }, [section]);

  useEffect(() => {
    if (disabled) {
      autoAttempted.current = false;
      return;
    }
    if (
      !preferenceLoaded ||
      !autoResume ||
      !transcriptionReady ||
      autoAttempted.current ||
      session.current
    )
      return;
    autoAttempted.current = true;
    const controller = new AbortController();
    autoProbe.current = controller;
    void (async () => {
      try {
        if (!window.isSecureContext || !navigator.permissions?.query) {
          setMessage(
            "Automatic listening needs localhost/HTTPS and browser permission. Use Resume listening.",
          );
          return;
        }
        const permission = await navigator.permissions.query({
          name: "microphone" as PermissionName,
        });
        if (controller.signal.aborted) return;
        if (permission.state !== "granted") {
          setMessage(
            "Allow microphone access, then use Resume listening. Automatic retries are paused.",
          );
          return;
        }
        anotherActive.current = false;
        ownership.current?.postMessage("probe-active");
        await wait(180, controller.signal);
        if (anotherActive.current) {
          setMessage(
            "Another Nexus window is already listening. This window stays muted.",
          );
          return;
        }
        if (!session.current) await autoStart.current();
      } catch {
        if (!controller.signal.aborted)
          setMessage(
            "Automatic listening could not start. Use Resume listening.",
          );
      }
    })();
    return () => controller.abort();
  }, [disabled, preferenceLoaded, autoResume, transcriptionReady]);

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
      await startAudio(context.resume(), signal);
      if (backgroundRef.current) {
        if (!context.audioWorklet || !window.AudioWorkletNode)
          throw new Error(
            "Background audio monitoring is unavailable. Use Chrome or Edge on laptop localhost.",
          );
        await startAudio(
          context.audioWorklet.addModule("/nexus-audio-meter.js"),
          signal,
        );
      }
    } catch (error) {
      void context?.close().catch(() => {});
      stream.getTracks().forEach((track) => track.stop());
      throw error;
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
      let meter: AudioWorkletNode | undefined;
      let done = false;
      const chunks: Blob[] = [];
      const cleanup = () => {
        if (interval) clearInterval(interval);
        if (meter) {
          meter.port.onmessage = null;
          meter.onprocessorerror = null;
          meter.disconnect();
        }
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
        const detector = new SpeechBoundary(
          backgroundRef.current ? 0 : performance.now(),
        );
        const sample = (rms: number, now: number) => {
          if (done) return;
          const boundary = detector.sample(rms, now);
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
        };
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
        if (backgroundRef.current) {
          meter = new AudioWorkletNode(audioContext, "nexus-audio-meter");
          const silence = audioContext.createGain();
          silence.gain.value = 0;
          source.connect(meter);
          meter.connect(silence);
          silence.connect(audioContext.destination);
          meter.port.onmessage = (event) => {
            const { rms, elapsed } = event.data ?? {};
            if (
              typeof rms === "number" &&
              typeof elapsed === "number" &&
              Number.isFinite(rms) &&
              Number.isFinite(elapsed)
            )
              sample(rms, elapsed);
          };
          meter.onprocessorerror = () =>
            finish(
              null,
              new Error(
                "Background audio monitoring stopped. Check your microphone and start again.",
              ),
            );
        } else {
          const analyser = audioContext.createAnalyser();
          analyser.fftSize = 1024;
          source.connect(analyser);
          const values = new Float32Array(analyser.fftSize);
          interval = setInterval(() => {
            try {
              analyser.getFloatTimeDomainData(values);
              sample(
                Math.sqrt(
                  values.reduce((sum, value) => sum + value * value, 0) /
                    values.length,
                ),
                performance.now(),
              );
            } catch {
              finish(
                null,
                new Error(
                  "Audio monitoring failed. Check your microphone and start again.",
                ),
              );
            }
          }, 80);
        }
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

  async function start(inBackground = false) {
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
    backgroundRef.current = inBackground;
    setBackground(inBackground);
    const controller = new AbortController();
    session.current = controller;
    ownership.current?.postMessage("started");
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
          muteRef.current();
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

  autoStart.current = () => start(true);

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
      <p>
        Background assistant mode keeps listening when you switch apps or Nexus
        sections. Speech picked up in that mode is automatically submitted to
        Nexus. Mute it for calls or private conversations.
      </p>
      <label className="nexus-sharing">
        <input
          type="checkbox"
          checked={autoResume}
          disabled={disabled}
          onChange={(e) => {
            const enabled = e.target.checked;
            remember(enabled);
            if (enabled) {
              autoAttempted.current = true;
              if (session.current && !backgroundRef.current) stop();
              if (!session.current && transcriptionReady) void start(true);
              else if (!transcriptionReady) {
                autoAttempted.current = false;
                setMessage("Waiting for local transcription readiness.");
              }
            } else stop("Automatic listening disabled. Microphone is off.");
          }}
        />
        Automatically resume background listening on this device
      </label>
      {preferenceNotice && <p>{preferenceNotice}</p>}
      <div className="nexus-buttons">
        <button
          onClick={() => void start()}
          disabled={disabled || active || !transcriptionReady}
        >
          Start conversation
        </button>
        <button
          onClick={() => void start(true)}
          disabled={disabled || active || !transcriptionReady}
        >
          Start background assistant
        </button>
        <button onClick={() => muteRef.current()} disabled={!active}>
          Stop conversation / Mute
        </button>
      </div>
      <p role="status" aria-live="polite" className="conversation-phase">
        <span aria-hidden="true">{active ? "●" : "○"}</span> {phase}
        {active && background && <span> · Background assistant on</span>}
      </p>
      {heard && <p>Last heard: {heard}</p>}
      {message && <p role="status">{message}</p>}
      <small>
        Enable the device setting once to resume background listening on future
        page loads when controller access, local transcription and browser
        microphone permission are ready. Mute, Ctrl+Alt+M (while this window has
        focus), or “stop listening” turns this setting off. The microphone
        remains off while Nexus thinks and speaks. Browser autoplay restrictions
        can require Resume listening. Closing the browser, navigating away,
        sign-out, sleep or losing controller access stops capture. This is not a
        Windows microphone service or a wake-word listener. Recent conversation
        context stays in this session only.
      </small>
      {((active && background) || (autoResume && preferenceLoaded)) &&
        createPortal(
          <aside
            className="nexus-assistant-dock"
            aria-label="Nexus background assistant"
          >
            <div>
              <strong>
                NEXUS ·{" "}
                {active
                  ? "Background assistant on"
                  : "Automatic listening requested"}
              </strong>
              <p role="status">{phase}</p>
              {!active && (
                <p>
                  {message ||
                    (!transcriptionReady
                      ? "Waiting for local voice readiness."
                      : disabled
                        ? "Controller access required."
                        : "Checking saved microphone permission…")}
                </p>
              )}
            </div>
            {!active && (
              <button
                type="button"
                disabled={disabled || !transcriptionReady}
                onClick={() => void start(true)}
              >
                Resume listening
              </button>
            )}
            <button type="button" onClick={() => muteRef.current()}>
              Mute Nexus
            </button>
          </aside>,
          document.body,
        )}
    </section>
  );
}
