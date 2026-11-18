"use client";
import { useEffect, useState } from "react";
type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };
export default function NexusPhoneInstall() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [message, setMessage] = useState("Open this page in Chrome on your Android phone using your Nexus host’s HTTPS address.");
  useEffect(() => {
    const ready = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const installed = () => { setPrompt(null); setMessage("Nexus installed. Open it from your home screen."); };
    window.addEventListener("beforeinstallprompt", ready);
    window.addEventListener("appinstalled", installed);
    if (window.matchMedia("(display-mode: standalone)").matches) setMessage("Nexus is open in app mode.");
    else if (!window.isSecureContext) setMessage("This connection needs HTTPS before microphone access and app installation are available on your phone.");
    return () => { window.removeEventListener("beforeinstallprompt", ready); window.removeEventListener("appinstalled", installed); };
  }, []);
  return <div>
    <p role="status">{message}</p>
    {prompt && <button onClick={async () => {
      const current = prompt; setPrompt(null);
      try { await current.prompt(); const result = await current.userChoice; setMessage(result.outcome === "accepted" ? "Installation accepted. Chrome will finish adding Nexus." : "Installation dismissed. You can still open Nexus in Chrome."); }
      catch { setMessage("Open Chrome’s menu and choose Install app or Add to Home screen if available."); }
    }}>Install Nexus</button>}
    <p>If Chrome does not show an install button, open its ⋮ menu and look for <strong>Install app</strong> or <strong>Add to Home screen</strong>. Availability depends on Chrome and your connection.</p>
  </div>;
}
