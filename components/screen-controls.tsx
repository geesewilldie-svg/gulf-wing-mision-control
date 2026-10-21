"use client";
import { useState } from "react";
import { ExternalLink, Monitor, Tv } from "lucide-react";
import { displayViews, type DisplayView } from "@/lib/displays";
export default function ScreenControls() {
  const [message, setMessage] = useState("");
  const open = (view: DisplayView) => {
    let popup: Window | null = null;
    try {
      popup = window.open(
        `/display?view=${view}`,
        `gulf-wing-${view}`,
        "popup,width=1440,height=900",
      );
    } catch {
      setMessage(
        "A display window could not be opened. Use an “Open here” link below.",
      );
      return;
    }
    if (!popup) {
      setMessage(
        "The new window was blocked. Allow pop-ups for this site, or use an “Open here” link below.",
      );
      return;
    }
    popup.opener = null;
    setMessage(
      "Display opened. Move that window onto your other monitor, then choose Fullscreen.",
    );
  };
  return (
    <details className="screen-controls">
      <summary>
        <Monitor size={15} /> Screens &amp; TV <span>OPEN DISPLAY CENTER</span>
      </summary>
      <div className="screen-center" aria-label="Screens and TV">
        <div className="screen-intro">
          <div>
            <span className="eyebrow">EXTEND YOUR COMMAND CENTER</span>
            <h2>A workspace without edges.</h2>
            <p>
              Open a dedicated view for each monitor. Windows in this browser
              follow your saved workspace.
            </p>
          </div>
          <Tv size={26} />
        </div>
        <div className="screen-options">
          {displayViews.map((view) => (
            <article key={view.id}>
              <Monitor size={18} />
              <h3>{view.name}</h3>
              <p>{view.description}</p>
              <button onClick={() => open(view.id)}>
                Open display <ExternalLink size={12} />
              </button>
              <a href={`/display?view=${view.id}`}>Open here</a>
            </article>
          ))}
        </div>
        <div className="screen-guidance">
          <strong>Desktop monitors</strong>
          <p>
            Connect your displays, choose Extend in your computer’s display
            settings, and move each new window to a screen.
          </p>
          <strong>Phone or LG TV</strong>
          <p>
            Use compatible AirPlay or phone screen mirroring, a supported
            browser Cast screen option, or an HDMI connection. The TV connection
            is managed by your device.
          </p>
          <p className="screen-limit">
            Views share updates only in the same browser profile and site
            address. Different devices need screen mirroring to share this
            session; cloud synchronization is not connected.
          </p>
        </div>
        <p className="screen-message" role="status">
          {message}
        </p>
      </div>
    </details>
  );
}
