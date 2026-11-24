"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useVisualHost } from "./use-visual-host";
export default function ExpandableVisual({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false),
    [message, setMessage] = useState("");
  const { slot, host } = useVisualHost(expanded);
  const trigger = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLDivElement>(null),
    native = useRef(false);
  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const app = document.querySelector<HTMLElement>(".app-shell"),
      inert = app?.inert;
    if (app) app.inert = true;
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setExpanded(false);
      }
    };
    const change = () => {
      if (native.current && !document.fullscreenElement) {
        native.current = false;
        setExpanded(false);
      }
    };
    document.addEventListener("keydown", key);
    document.addEventListener("fullscreenchange", change);
    return () => {
      document.body.style.overflow = previous;
      if (app) app.inert = !!inert;
      document.removeEventListener("keydown", key);
      document.removeEventListener("fullscreenchange", change);
      if (document.fullscreenElement === panel.current)
        void document.exitFullscreen().catch(() => {});
      trigger.current?.focus();
    };
  }, [expanded]);
  const content = (
    <div
      className={expanded ? "nexus-expanded-visual" : ""}
      role={expanded ? "dialog" : undefined}
      aria-modal={expanded ? true : undefined}
      aria-label={expanded ? `${name} expanded` : undefined}
      ref={panel}
      onKeyDown={(event) => {
        if (!expanded || event.key !== "Tab") return;
        const targets = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex="0"]',
          ),
        ).filter((element) => element.getClientRects().length > 0);
        const first = targets[0],
          last = targets.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
    >
      {expanded && (
        <div className="nexus-draft-actions">
          <button onClick={() => setExpanded(false)}>
            Close expanded {name}
          </button>
          <button
            onClick={async () => {
              try {
                if (!panel.current?.requestFullscreen) throw Error();
                await panel.current.requestFullscreen();
                native.current = true;
              } catch {
                setMessage(
                  "Browser fullscreen is unavailable. Expanded view remains available.",
                );
              }
            }}
          >
            Browser fullscreen
          </button>
        </div>
      )}
      {message && expanded && <p role="status">{message}</p>}
      {children}
    </div>
  );
  return (
    <>
      <button ref={trigger} onClick={() => setExpanded(true)}>
        Expand {name}
      </button>
      <div ref={slot} />
      {host && createPortal(content, host)}
    </>
  );
}
