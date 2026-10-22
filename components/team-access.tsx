"use client";
import { useState } from "react";
export default function TeamAccess({ disabled }: { disabled: boolean }) {
  const [urls, setUrls] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  return (
    <details className="sync-controls">
      <summary>Family / team device access</summary>
      <section className="sync-content" aria-label="Shared business access">
        <h2>Your wife's phone and Chromebook</h2>
        <p>
          First connect both devices and the ASUS laptop to the same trusted
          Wi-Fi. Keep Mission Control running on the laptop and keep it awake.
        </p>
        <ol>
          <li>Open the laptop's network address in Chrome on her device.</li>
          <li>
            Open Connect devices and enter your private laptop pairing code.
            Controller access allows business edits; treat it like a shared
            business password.
          </li>
          <li>
            Open Co-hosting, then Load business records. Saved changes appear on
            other open business screens about every eight seconds, unless a form
            has unsaved changes.
          </li>
          <li>
            Bookmark the page or use Chrome's Create shortcut / Add to home
            screen option when available.
          </li>
        </ol>
        <button
          disabled={disabled}
          onClick={async () => {
            try {
              const r = await fetch("/api/sync/access");
              const data = await r.json();
              if (!r.ok) throw Error(data.error);
              setUrls(data.urls);
              setMessage(
                data.urls.length
                  ? "Choose the address on your shared Wi-Fi. VPN or virtual adapters may show additional addresses."
                  : "No private Wi-Fi address found. Check Windows network settings.",
              );
            } catch (err) {
              setMessage((err as Error).message);
            }
          }}
        >
          Show laptop network addresses
        </button>
        <ul>
          {urls.map((url) => (
            <li key={url}>
              <a href={url} target="_blank" rel="noreferrer">
                {url}
              </a>
            </li>
          ))}
        </ul>
        <p>
          Each device gets its own browser session, but trusted controllers
          share full business permissions. There are no named employee accounts
          or per-person audit identities yet. When a form conflicts with another
          device, reload and review it before saving.
        </p>
        <p>
          Typed Nexus questions and business workflows work over this Wi-Fi
          link. The phone/Chromebook microphone needs HTTPS; browser sound
          permissions may also require a click. Laptop voice can continue on
          localhost. Do not forward port 3000 on your router.
        </p>
        <p>
          Next: private access while away through a device VPN and HTTPS after
          device setup. No public URL or remote access has been enabled.
        </p>
        <p>
          If the pairing code is lost, run{" "}
          <code>npm.cmd run sync:setup -- --rotate</code> in a spare laptop
          PowerShell tab. This revokes existing sessions; re-pair your devices
          with the new code.
        </p>
        <p role="status">{message}</p>
      </section>
    </details>
  );
}
