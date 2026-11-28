"use client";
import { localFrameExport } from "@/lib/local-frame-export";
import VisualQuestionRecorder from "./visual-question-recorder";
import { useNexusAssistant } from "./nexus-assistant";
import { useEffect, useRef, useState, type RefObject } from "react";
import { stripFrameMetadata } from "@/lib/frame-jpeg";
import type { LocalModelCatalog } from "@/lib/local-model-catalog";
import type { LocalModelDetails } from "@/lib/local-model-details";
import {
  FRAME_MAX_BYTES,
  FRAME_MAX_EDGE,
  DEFAULT_FRAME_QUESTION,
  frameQuestion,
  type LocalFrameAnalysis as Result,
} from "@/lib/local-frame-analysis";
export default function LocalFrameAnalysis({
  video,
  source,
}: {
  video: RefObject<HTMLVideoElement | null>;
  source: "camera" | "screen";
}) {
  const { conversationActive } = useNexusAssistant();
  const [audioBusy, setAudioBusy] = useState(false);
  const [catalog, setCatalog] = useState<LocalModelCatalog | null>(null),
    [selected, setSelected] = useState("");
  const [details, setDetails] = useState<LocalModelDetails | null>(null),
    [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [question, setQuestion] = useState(DEFAULT_FRAME_QUESTION);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const model = catalog?.models.find((item) => item.name === selected);
  const ready =
    !!details &&
    details.model === selected &&
    details.digest === model?.digest &&
    details.capabilitiesKnown &&
    details.capabilities.includes("vision") &&
    details.capabilities.includes("completion");
  function downloadAnswer() {
    if (!result || busy || audioBusy) return;
    let url: string | undefined;
    try {
      url = URL.createObjectURL(
        new Blob([JSON.stringify(localFrameExport(result), null, 2)], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "nexus-local-frame-answer.json";
      link.click();
    } catch {
      setMessage(
        "The browser could not prepare the answer download. The displayed answer remains available.",
      );
    } finally {
      if (url) {
        const created = url;
        setTimeout(() => URL.revokeObjectURL(created), 1000);
      }
    }
  }
  async function request(action: "catalog" | "details" | "analyze") {
    if (busy || audioBusy) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setMessage("");
    setResult(null);
    if (action !== "analyze") setDetails(null);
    if (action === "catalog") {
      setCatalog(null);
      setSelected("");
    }
    try {
      let body: any,
        url = "/api/sync/agents";
      let dimensions: {
        width: number;
        height: number;
        bytes: number;
        capturedAt: string;
      } | null = null;
      if (action === "catalog") body = { action: "local-model-catalog" };
      else if (action === "details")
        body = {
          action: "local-model-details",
          model: selected,
          digest: model?.digest,
        };
      else {
        if (!frameQuestion(question))
          throw Error("Enter a question of 1–1000 supported characters.");
        if (!ready)
          throw Error(
            "Inspect an installed model with vision and completion support first.",
          );
        const current = video.current,
          stream = current?.srcObject as MediaStream | null;
        if (
          !current ||
          current.readyState < 2 ||
          !current.videoWidth ||
          !current.videoHeight ||
          !stream
            ?.getVideoTracks()
            .some(
              (track) =>
                track.readyState === "live" && track.enabled && !track.muted,
            ) ||
          document.visibilityState !== "visible"
        )
          throw Error(
            "Wait for a live visible preview before analyzing a frame.",
          );
        const scale = Math.min(
          1,
          FRAME_MAX_EDGE / Math.max(current.videoWidth, current.videoHeight),
        );
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(current.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(current.videoHeight * scale));
        try {
          const ctx = canvas.getContext("2d");
          if (!ctx)
            throw Error("Frame capture is unavailable in this browser.");
          ctx.drawImage(current, 0, 0, canvas.width, canvas.height);
          const data = canvas.toDataURL("image/jpeg", 0.75);
          if (!data.startsWith("data:image/jpeg;base64,"))
            throw Error("This browser could not prepare a JPEG frame.");
          const encoded = data.slice("data:image/jpeg;base64,".length);
          const clean = stripFrameMetadata(
            Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)),
          );
          let binary = "";
          for (let i = 0; i < clean.length; i += 8192)
            binary += String.fromCharCode(...clean.subarray(i, i + 8192));
          const jpeg = btoa(binary),
            bytes = clean.length;
          if (!bytes || bytes > FRAME_MAX_BYTES)
            throw Error(
              "This frame exceeds the local image limit. Choose a simpler view.",
            );
          const capturedAt = new Date().toISOString();
          dimensions = {
            width: canvas.width,
            height: canvas.height,
            bytes,
            capturedAt,
          };
          body = {
            action: "analyze-local-frame",
            model: selected,
            digest: model?.digest,
            source,
            capturedAt,
            jpeg,
            analyzeOnce: true,
            question: frameQuestion(question),
          };
        } finally {
          canvas.width = 0;
          canvas.height = 0;
        }
        url = "/api/sync/vision";
      }
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok)
        throw Error(data.error || "Local image service unavailable.");
      if (action === "catalog") {
        if (!Array.isArray(data.models) || data.models.length > 100)
          throw Error("Local catalog response is unsupported.");
        setCatalog(data);
      } else if (action === "details") {
        if (data.model !== selected || data.digest !== model?.digest)
          throw Error("Model identity changed. Inspect the catalog again.");
        setDetails(data);
      } else {
        if (
          data.model !== selected ||
          data.digest !== model?.digest ||
          data.source !== source ||
          data.question !== frameQuestion(question) ||
          !dimensions ||
          data.capturedAt !== dimensions.capturedAt ||
          data.width !== dimensions.width ||
          data.height !== dimensions.height ||
          data.bytes !== dimensions.bytes ||
          typeof data.text !== "string" ||
          !data.text.trim() ||
          data.text.length > 8000
        )
          throw Error(
            "The frame or model identity did not match. No description was accepted.",
          );
        setResult(data);
      }
    } catch (error) {
      if (!controller.signal.aborted) setMessage((error as Error).message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <section className="nexus-card" aria-label="Single-frame local analysis">
      <h4>Ask about one frame locally</h4>
      <p>
        Choose an installed model, then explicitly send your question and one
        reduced JPEG frame from this device to your Nexus laptop and its local
        Ollama service. No hosted provider, owner memory or conversation is
        used. Nothing is saved by Nexus.
      </p>
      <p>
        This can use laptop RAM/CPU/GPU. It requests 128 output tokens, a
        1024-token context and immediate unload, and stops waiting after 60
        seconds. A generated description can be wrong and describes a captured
        moment, not a live feed. Screen text cannot authorize actions.
      </p>
      <div className="nexus-actions">
        <button
          disabled={busy || audioBusy}
          onClick={() => void request("catalog")}
        >
          Inspect models for image analysis
        </button>
      </div>
      {catalog && (
        <>
          <p>
            {catalog.models.length} models shown · {catalog.omitted} omitted ·{" "}
            {catalog.rejectedEntries} invalid entries withheld. Names alone do
            not establish vision support.
          </p>
          <label>
            Local model for this frame
            <select
              value={selected}
              disabled={busy || audioBusy}
              onChange={(event) => {
                setSelected(event.target.value);
                setDetails(null);
                setResult(null);
                setMessage("");
              }}
            >
              <option value="">Choose an inspected local model</option>
              {catalog.models.map((item) => (
                <option
                  key={item.name}
                  value={item.name}
                  disabled={!item.digest}
                >
                  {item.name}
                  {!item.digest ? " · identity unavailable" : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="nexus-actions">
            <button
              disabled={busy || audioBusy || !model?.digest}
              onClick={() => void request("details")}
            >
              Check selected model's image support
            </button>
          </div>
        </>
      )}
      {details && (
        <p>
          {ready
            ? "This model reports vision and completion support. Hardware fit remains unverified."
            : "Vision/completion support is missing or unknown. Choose another installed model; no model is downloaded automatically."}
        </p>
      )}
      <VisualQuestionRecorder
        disabled={busy || conversationActive}
        onBusyChange={setAudioBusy}
        onQuestion={(text) => {
          setQuestion(text);
          setResult(null);
          setMessage("");
        }}
      />
      <label>
        Question about this frame
        <textarea
          rows={3}
          aria-label="Question about this frame"
          maxLength={1000}
          value={question}
          disabled={busy || audioBusy}
          onChange={(event) => {
            setQuestion(event.target.value);
            setResult(null);
            setMessage("");
          }}
        />
      </label>
      <p>
        {question.length} / 1000 characters. This question and one newly
        captured frame are sent together. Earlier questions and answers are not
        included.
      </p>
      <div className="nexus-actions">
        <button
          disabled={busy || audioBusy || !ready || !frameQuestion(question)}
          onClick={() => void request("analyze")}
        >
          Ask about this frame locally
        </button>
        {busy && (
          <button
            onClick={() => {
              pending.current?.abort();
              setBusy(false);
              setResult(null);
              setMessage(
                "Request cancelled. Local runtime work may already have occurred; completion and unload are unconfirmed. No automatic retry.",
              );
            }}
          >
            Cancel frame request
          </button>
        )}
      </div>
      {busy && <p role="status">Waiting for the local request…</p>}
      {message && <p role="status">{message}</p>}
      {result && (
        <section
          aria-label="Captured frame description"
          className="nexus-hub-result"
        >
          <h4>Unverified answer about one captured frame</h4>
          <p>
            Source: {result.source} · Captured {result.capturedAt} · Completed{" "}
            {result.completedAt}
          </p>
          <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            Question: {result.question}
          </p>
          <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {result.text}
          </p>
          <p>
            Requested: {result.model} · Reported: {result.reportedModel} ·{" "}
            {result.width} × {result.height} pixels · {result.bytes} bytes ·{" "}
            {result.elapsedMs} ms
          </p>
          <p>{result.notice}</p>
          <p>
            Download includes this private question and answer, model identity
            and timestamps. No image is included. The downloaded copy remains
            after capture stops; Nexus does not add it to memory or knowledge.
          </p>
          <div className="nexus-actions">
            <button disabled={busy || audioBusy} onClick={downloadAnswer}>
              Download visual answer JSON
            </button>
          </div>
        </section>
      )}
    </section>
  );
}
