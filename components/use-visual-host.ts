"use client";
import { useLayoutEffect, useRef, useState } from "react";

// Keep one portal destination for the lifetime of the visual. Moving that DOM
// destination preserves React state, canvases, focus history and pending reads.
export function useVisualHost(expanded: boolean) {
  const slot = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const element = document.createElement("div");
    setHost(element);
    return () => element.remove();
  }, []);
  useLayoutEffect(() => {
    if (!host) return;
    const destination = expanded ? document.body : slot.current;
    destination?.appendChild(host);
  }, [host, expanded]);
  return { slot, host };
}
