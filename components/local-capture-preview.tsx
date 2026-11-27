"use client";
import LocalFrameAnalysis from "./local-frame-analysis";
import { useEffect, useRef, useState } from "react";
type Kind = "camera" | "screen";
export default function LocalCapturePreview({ enabled }: { enabled: boolean }) {
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef(0),
    requesting = useRef(false),
    mounted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [phase, setPhase] = useState<
    "off" | "requesting" | "active" | "stopping"
  >("off");
  const [kind, setKind] = useState<Kind | null>(null),
    [message, setMessage] = useState("Capture is off.");
  const [support, setSupport] = useState({ camera: false, screen: false });
  function stop(text: string, announce = true) {
    generation.current++;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const current = stream.current;
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    current?.getTracks().forEach((track) => track.stop());
    if (announce && mounted.current) {
      setPhase(requesting.current ? "stopping" : "off");
      setKind(null);
      setMessage(
        requesting.current
          ? text +
              " Close the browser's capture chooser if it remains open. Any late stream will be stopped; another request stays disabled until this one settles."
          : text,
      );
    }
  }
  useEffect(() => {
    mounted.current = true;
    setSupport({
      camera: !!navigator.mediaDevices?.getUserMedia,
      screen: !!navigator.mediaDevices?.getDisplayMedia,
    });
    const hidden = () => {
      if (document.visibilityState !== "visible")
        stop("Capture stopped because this page is no longer visible.");
    };
    const leaving = () => stop("Capture stopped because you left this page.");
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", leaving);
    return () => {
      mounted.current = false;
      stop("", false);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", leaving);
    };
  }, []);
  useEffect(() => {
    if (!enabled) stop("Capture is off. Controller access is required.");
  }, [enabled]);
  async function start(nextKind: Kind) {
    if (
      !enabled ||
      requesting.current ||
      stream.current ||
      !support[nextKind] ||
      document.visibilityState !== "visible"
    )
      return;
    requesting.current = true;
    const epoch = ++generation.current;
    setKind(nextKind);
    setPhase("requesting");
    setMessage("Choose a source in your browser. No preview is active yet.");
    timer.current = setTimeout(
      () => stop("Capture request expired after 20 seconds."),
      20000,
    );
    try {
      const acquired =
        nextKind === "camera"
          ? await navigator.mediaDevices.getUserMedia({
              video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 15 },
              },
              audio: false,
            })
          : await navigator.mediaDevices.getDisplayMedia({
              video: { frameRate: 15 },
              audio: false,
            });
      requesting.current = false;
      if (
        !mounted.current ||
        epoch !== generation.current ||
        document.visibilityState !== "visible"
      ) {
        acquired.getTracks().forEach((track) => track.stop());
        if (mounted.current) {
          setPhase("off");
          setKind(null);
          setMessage("Capture is off. The late browser stream was stopped.");
        }
        return;
      }
      if (timer.current) clearTimeout(timer.current);
      const tracks = acquired.getVideoTracks();
      if (
        !tracks.length ||
        tracks.some((track) => track.readyState !== "live") ||
        acquired.getAudioTracks().length
      ) {
        acquired.getTracks().forEach((track) => track.stop());
        throw Error("Unsupported stream");
      }
      stream.current = acquired;
      const ended = () => {
        if (stream.current === acquired)
          stop("Capture ended. No preview is retained.");
      };
      tracks.forEach((track) => {
        track.addEventListener("ended", ended, { once: true });
        track.addEventListener("mute", ended, { once: true });
      });
      acquired.addEventListener("inactive", ended, { once: true });
      if (!video.current) {
        stop("Preview unavailable. Capture stopped.");
        return;
      }
      video.current.srcObject = acquired;
      setPhase("active");
      setMessage(
        `${nextKind === "camera" ? "Camera" : "Screen"} preview active on this device. Stops automatically within 60 seconds while this page is running.`,
      );
      timer.current = setTimeout(
        () => stop("Capture stopped at the 60-second preview limit."),
        60000,
      );
      try {
        await video.current.play();
      } catch {
        if (stream.current === acquired)
          stop("The browser could not play this preview. Capture stopped.");
      }
    } catch {
      requesting.current = false;
      if (mounted.current && epoch === generation.current)
        stop(
          "Capture was denied, cancelled or unavailable. No preview was accepted.",
        );
    } finally {
      requesting.current = false;
      if (mounted.current && epoch !== generation.current && !stream.current) {
        setPhase("off");
        setKind(null);
      }
    }
  }
  return (
    <section
      className="nexus-card nexus-capture-preview"
      aria-label="Local camera and screen preview"
    >
      <h3>Camera and screen preview</h3>
      <p>
        Preview this device's camera or a screen you choose. Video stays in this
        browser until you separately choose to describe one frame locally. Nexus
        does not record or save the preview. Continuous vision is not connected.
      </p>
      <p>
        Audio is off. Preview stops when you leave this section, hide this
        browser tab, revoke access or reach the 60-second limit. Nothing resumes
        automatically. Your browser may not support screen capture on a phone.
      </p>
      <div className="nexus-actions">
        <button
          disabled={!enabled || !support.camera || phase !== "off"}
          onClick={() => void start("camera")}
        >
          Start camera preview
        </button>
        <button
          disabled={!enabled || !support.screen || phase !== "off"}
          onClick={() => void start("screen")}
        >
          Choose screen to preview
        </button>
        <button
          disabled={phase === "off"}
          onClick={() =>
            stop("Capture stopped by you. No preview is retained.")
          }
        >
          Stop capture
        </button>
      </div>
      {!enabled && (
        <p>Pair this device with controller access to use preview.</p>
      )}
      {enabled && (!support.camera || !support.screen) && (
        <p>
          Available in this browser: camera{" "}
          {support.camera ? "supported" : "unavailable"} · screen{" "}
          {support.screen ? "supported" : "unavailable"}. A secure page and
          browser permission are required.
        </p>
      )}
      <p role="status">{message}</p>
      <p>
        Capture state:{" "}
        {phase === "active"
          ? `${kind} preview active`
          : phase === "requesting"
            ? "waiting for browser permission"
            : phase === "stopping"
              ? "waiting for browser request to settle"
              : "off"}{" "}
        · Continuous model vision: not connected
      </p>
      <video
        ref={video}
        className="nexus-capture-video"
        aria-label="Local live preview"
        hidden={phase !== "active"}
        muted
        playsInline
        autoPlay
        onError={() => stop("Preview failed. Capture stopped.")}
      />
      {phase === "active" && kind && enabled && (
        <LocalFrameAnalysis video={video} source={kind} />
      )}
    </section>
  );
}
