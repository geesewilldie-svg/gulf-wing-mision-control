"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
export default function GalaxyFileDialog({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null),
    close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const app = document.querySelector<HTMLElement>(".app-shell"),
      wasInert = app?.inert;
    if (app && !app.contains(panel.current)) app.inert = true;
    panel.current?.querySelector<HTMLElement>("h4")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        close.current();
      } else if (event.key === "Tab") {
        const controls = Array.from(
          panel.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]),[tabindex="0"]',
          ) || [],
        ).filter((node) => node.getClientRects().length);
        if (!controls.length) return;
        const first = controls[0],
          last = controls.at(-1)!;
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === panel.current?.querySelector("h4"))
        ) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("keydown", key, true);
      document.body.style.overflow = overflow;
      if (app) app.inert = !!wasInert;
      previous?.focus?.();
    };
  }, []);
  return createPortal(
    <div className="memory-file-dialog-backdrop">
      <div
        ref={panel}
        className="memory-file-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Open file preview"
      >
        <button className="memory-file-close" onClick={onClose}>
          Close file
        </button>
        {children}
      </div>
    </div>,
    document.fullscreenElement || document.body,
  );
}
