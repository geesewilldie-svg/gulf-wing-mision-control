"use client";
import { useEffect, useState, useRef } from "react";
import type { MorningBrief } from "@/lib/server/morning-brief";
export default function MorningBriefNotice({
  disabled,
  voiceActive,
}: {
  disabled: boolean;
  voiceActive: boolean;
}) {
  const [brief, setBrief] = useState<MorningBrief | null>(null);
  const [error, setError] = useState("");
  const attempted = useRef("");
  useEffect(() => {
    if (disabled) {
      setBrief(null);
      return;
    }
    const abort = new AbortController();
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/sync/brief/morning", {
          method: "POST",
          signal: abort.signal,
        });
        const data = await r.json();
        if (!r.ok) throw Error(data.error);
        if (data.brief) {
          const key =
            "nexus.morning.seen." + data.brief.timezone + "." + data.brief.date;
          let seen = false;
          try {
            seen = localStorage.getItem(key) === "yes";
          } catch {}
          if (!seen) setBrief(data.brief);
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError")
          setError("Morning brief unavailable. Check Daily brief settings.");
      }
    };
    void check();
    const timer = setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      abort.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [disabled, voiceActive]);
  // Do not start independent audio while conversation is using the microphone.
  // Voice activity reveals the same brief; speech remains under conversation controls.
  useEffect(() => {
    if (voiceActive && brief && attempted.current !== brief.generatedAt) {
      attempted.current = brief.generatedAt;
      setError(
        "Your morning brief is ready below. Ask “read my morning brief” to hear it.",
      );
    }
  }, [voiceActive, brief]);
  if (disabled) return null;
  return (
    <aside className="nexus-card" aria-label="Morning briefing">
      <p role="status">{error}</p>
      {brief && (
        <>
          <h2>Your morning brief · {brief.date}</h2>
          <p>
            {brief.late ? "Generated after the 5 a.m. target. " : ""}Saved
            snapshot · {brief.timezone}. Calendar availability is shown in the
            brief. Email delivery is not connected.
          </p>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {brief.text}
          </pre>
          <button
            onClick={() => {
              try {
                localStorage.setItem(
                  "nexus.morning.seen." + brief.timezone + "." + brief.date,
                  "yes",
                );
              } catch {}
              setBrief(null);
            }}
          >
            Dismiss for today on this device
          </button>
        </>
      )}
    </aside>
  );
}
