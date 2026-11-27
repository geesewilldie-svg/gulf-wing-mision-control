"use client";
import { useEffect, useRef, useState } from "react";
import { frameQuestion } from "@/lib/local-frame-analysis";
export default function VisualQuestionRecorder({
  disabled,
  onQuestion,
  onBusyChange,
}: {
  disabled: boolean;
  onQuestion: (text: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [phase, setPhase] = useState<
    "off" | "permission" | "recording" | "transcribing" | "settling"
  >("off");
  const [draft, setDraft] = useState(""),
    [message, setMessage] = useState("Microphone is off."),
    [supported, setSupported] = useState(false);
  const stream = useRef<MediaStream | null>(null),
    recorder = useRef<MediaRecorder | null>(null),
    request = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    epoch = useRef(0),
    mounted = useRef(false),
    pendingPermission = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const handlers = useRef({ onQuestion, onBusyChange });
  handlers.current = { onQuestion, onBusyChange };
  function clearMedia() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const media = recorder.current;
    recorder.current = null;
    if (media) {
      media.onstop = null;
      media.ondataavailable = null;
      media.onerror = null;
      try {
        if (media.state !== "inactive") media.stop();
      } catch {
        /* Track release must still happen if the recorder fails. */
      }
    }
    const owned = stream.current;
    stream.current = null;
    owned?.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        /* Continue releasing other owned tracks. */
      }
    });
  }
  function cancel(text: string, announce = true) {
    epoch.current++;
    request.current?.abort();
    request.current = null;
    clearMedia();
    if (announce && mounted.current) {
      setDraft("");
      setPhase(pendingPermission.current ? "settling" : "off");
      setMessage(
        pendingPermission.current
          ? text +
              " Close any browser permission prompt; a late microphone stream will be stopped."
          : text,
      );
    }
  }
  function finishRecording() {
    try {
      recorder.current?.stop();
    } catch {
      cancel(
        "Recording failed while stopping. Audio was discarded; your typed question was kept.",
      );
    }
  }
  useEffect(() => {
    mounted.current = true;
    setSupported(
      !!(
        window.isSecureContext &&
        typeof navigator.mediaDevices?.getUserMedia === "function" &&
        typeof window.MediaRecorder === "function"
      ),
    );
    const hidden = () => {
      if (document.visibilityState !== "visible")
        cancel("Recording stopped because this page is hidden.");
    };
    const leaving = () =>
      cancel("Recording stopped because you left this page.");
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", leaving);
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel("gulf-wing-nexus-conversation");
      channel.current.onmessage = (event) => {
        if (
          event.data === "probe-active" &&
          (pendingPermission.current || stream.current || request.current)
        )
          channel.current?.postMessage("active");
        if (event.data === "started")
          cancel(
            "Recording stopped because another Nexus conversation started.",
          );
      };
    }
    return () => {
      mounted.current = false;
      cancel("", false);
      handlers.current.onBusyChange(false);
      channel.current?.close();
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", leaving);
    };
  }, []);
  useEffect(() => {
    handlers.current.onBusyChange(phase !== "off");
  }, [phase]);
  useEffect(() => {
    if (disabled)
      cancel(
        "Recording is off while another request or conversation is active.",
      );
  }, [disabled]);
  async function start() {
    if (
      disabled ||
      phase !== "off" ||
      pendingPermission.current ||
      !supported ||
      document.visibilityState !== "visible"
    )
      return;
    const run = ++epoch.current;
    pendingPermission.current = true;
    channel.current?.postMessage("started");
    setDraft("");
    setPhase("permission");
    setMessage(
      "Waiting for microphone permission. No audio has been submitted.",
    );
    timer.current = setTimeout(
      () => cancel("Microphone request expired."),
      15000,
    );
    try {
      const audio = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      pendingPermission.current = false;
      if (
        !mounted.current ||
        run !== epoch.current ||
        document.visibilityState !== "visible"
      ) {
        audio.getTracks().forEach((t) => t.stop());
        if (mounted.current) {
          setPhase("off");
          setMessage("Microphone is off. The late stream was stopped.");
        }
        return;
      }
      if (
        !audio.getAudioTracks().length ||
        audio.getVideoTracks().length ||
        audio.getAudioTracks().some((t) => t.readyState !== "live")
      ) {
        audio.getTracks().forEach((t) => t.stop());
        throw Error();
      }
      if (timer.current) clearTimeout(timer.current);
      stream.current = audio;
      const media = new MediaRecorder(audio),
        chunks: Blob[] = [];
      let size = 0;
      recorder.current = media;
      audio.getTracks().forEach((t) =>
        t.addEventListener(
          "ended",
          () => {
            if (run === epoch.current)
              cancel("Microphone ended. Recording discarded.");
          },
          { once: true },
        ),
      );
      media.ondataavailable = (event) => {
        if (run !== epoch.current) return;
        size += event.data.size;
        if (size > 512 * 1024) {
          cancel("Recording exceeded its size limit and was discarded.");
          return;
        }
        if (event.data.size) chunks.push(event.data);
      };
      media.onerror = () =>
        cancel("Audio recording failed. Nothing was submitted.");
      media.onstop = async () => {
        if (run !== epoch.current || !mounted.current) return;
        clearMedia();
        if (!size) {
          setPhase("off");
          setMessage("No audio was captured. Nothing was submitted.");
          return;
        }
        setPhase("transcribing");
        setMessage("Microphone is off. Transcribing locally for your review…");
        const controller = new AbortController();
        request.current = controller;
        timer.current = setTimeout(
          () => cancel("Transcription timed out. No automatic retry."),
          30000,
        );
        try {
          const response = await fetch("/api/sync/voice?action=transcribe", {
            method: "POST",
            headers: { "Content-Type": media.mimeType || "audio/webm" },
            body: new Blob(chunks, { type: media.mimeType || "audio/webm" }),
            signal: controller.signal,
          });
          const data = await response.json();
          if (
            !mounted.current ||
            controller.signal.aborted ||
            run !== epoch.current
          )
            return;
          if (!response.ok || !frameQuestion(data.text)) throw Error();
          setDraft(frameQuestion(data.text)!);
          setMessage(
            "Review the transcript before using it. No image or question has been sent to a vision model.",
          );
        } catch {
          if (
            mounted.current &&
            run === epoch.current &&
            !controller.signal.aborted
          )
            setMessage(
              "Local transcription failed or returned an empty, oversized or unsupported question. Your typed question was kept. No automatic retry.",
            );
        } finally {
          if (mounted.current && run === epoch.current) {
            if (timer.current) clearTimeout(timer.current);
            timer.current = null;
            request.current = null;
            setPhase("off");
          }
        }
      };
      media.start(250);
      setPhase("recording");
      setMessage(
        "Recording your visual question · microphone on · up to 10 seconds.",
      );
      timer.current = setTimeout(() => {
        if (run === epoch.current && media.state === "recording")
          finishRecording();
      }, 10000);
    } catch {
      pendingPermission.current = false;
      if (mounted.current && run === epoch.current)
        cancel("Microphone permission was denied or recording is unavailable.");
    } finally {
      pendingPermission.current = false;
      if (mounted.current && run !== epoch.current) setPhase("off");
    }
  }
  return (
    <section className="nexus-card" aria-label="Record a visual question">
      <h4>Speak your question</h4>
      <p>
        Record up to 10 seconds. Audio is sent to your Nexus laptop's local
        transcription worker. Review the draft, then use it as your question. An
        image is sent only when you choose Ask about this frame locally.
      </p>
      {!supported && (
        <p>
          Recording needs localhost or HTTPS, microphone permission and a
          supported browser. Typed questions remain available.
        </p>
      )}
      <div className="nexus-actions">
        <button
          disabled={disabled || !supported || phase !== "off"}
          onClick={() => void start()}
        >
          Record visual question
        </button>
        {phase === "recording" && (
          <button onClick={finishRecording}>
            Stop and transcribe question
          </button>
        )}
        {phase !== "off" && (
          <button
            onClick={() =>
              cancel(
                "Stopped recording or waiting for transcription. Local worker processing may already have started. No image was submitted; your typed question was kept.",
              )
            }
          >
            Cancel visual recording
          </button>
        )}
      </div>
      <p role="status">{message}</p>
      {draft && (
        <section aria-label="Visual question transcript">
          <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {draft}
          </p>
          <div className="nexus-actions">
            <button
              disabled={disabled || phase !== "off"}
              onClick={() => {
                handlers.current.onQuestion(draft);
                setDraft("");
                setMessage(
                  "Transcript copied into the question field. Review or edit it, then explicitly ask about a new frame.",
                );
              }}
            >
              Use transcript as question
            </button>
            <button
              disabled={phase !== "off"}
              onClick={() => {
                setDraft("");
                setMessage(
                  "Transcript discarded. Your typed question was kept.",
                );
              }}
            >
              Discard question transcript
            </button>
          </div>
        </section>
      )}
    </section>
  );
}
