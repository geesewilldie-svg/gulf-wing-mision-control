# Nexus while you work in other apps

On your Windows ASUS, Nexus can keep a conversation going while another app or browser tab has focus. This is a browser conversation with an optional saved automatic-resume setting, not a Windows service. It does not give Nexus access to your other apps, files, keyboard or business accounts.

## Start once

1. Keep Mission Control, Ollama and Nexus Voice running as usual.
2. Open http://localhost:3000/nexus in Chrome or Edge. Use a separate window if convenient and keep it open while working elsewhere.
3. Pair as a controller. Under Ask Nexus, leave Routing on Auto for generated answers from your local model.
4. Expand **Nexus voice · Push to talk**. Leave Preferred available voice selected for Isabella; local transcription must say ready.
5. Click **Start background assistant** once and allow microphone access. Wait for Listening and Background assistant on.
6. Switch to your other app. Speak a question, pause about 1.4 seconds, and let Nexus answer. She then listens again. Speech picked up while this mode is active is automatically submitted, so mute for calls or private conversations.

There is no additional background subscription, API key, model download or installer. Your existing local voice and model setup is reused. No wake word is installed; you do not have to say “Nexus” before each question.

## Mute and status

The compact **NEXUS · Background assistant on** dock stays visible inside the Nexus page even when its voice panel is collapsed. It shows Listening, Transcribing, Thinking or Speaking. The microphone is released during transcription, thinking and playback to reduce echo; this is turn-taking rather than voice interruption during an answer.

- Click **Mute Nexus** in the dock, or **Stop conversation / Mute** in the panel, to cancel recording, pending requests and playback.
- Say **stop listening** while she is listening. Voice mute cannot be heard while the microphone is off during her answer.
- **Ctrl+Alt+M** mutes when the Nexus window has keyboard focus. It is not a Windows-wide shortcut; while using another app, return to Nexus or use the spoken stop command.
- Starting another conversation in the same browser profile using the same laptop address mutes the previous conversation window. Other profiles, addresses and devices are separate.

**Start conversation** retains the original foreground behavior: hiding the tab, changing Nexus sections or closing its voice panel stops it. **Start background assistant** continues through those changes, including Ask Nexus, Co-hosting, Marketing and Connections. Visiting another URL in that window, refreshing, closing the window, losing controller access or an audio/model error still stops it. With the automatic-resume device setting enabled, reopening the same site can resume it once controller access, local transcription and previously granted browser permission are ready. Without that setting it stays off. Errors do not create an indefinite retry loop. A turn remains limited to 30 seconds; long turns stop with a visible message.

## Keep the host available

Keep Chrome/Edge and the three laptop services running. Keep the laptop awake, preferably plugged in. Sleep, hibernation, closing the lid or browser suspension can interrupt capture; an open browser is required. If necessary, review Windows Settings → System → Power / Power & battery → screen and sleep settings for the plugged-in laptop. The app does not change these settings.

If Chrome's Memory Saver suspends the page, add 127.0.0.1 to Settings → Performance → Always keep these sites active. In Edge, review sleeping-tab exclusions under its performance settings. If audio is blocked, allow microphone and sound for the local site, then start again. Headphones reduce pickup of other apps and speakers. Browser/site permissions and real Windows behavior must be checked on your laptop.

This mode primarily targets the Windows laptop. Your phone's plain HTTP LAN address cannot capture microphone audio, and Android/ChromeOS may suspend browser capture in the background. HTTPS and a separately installed native tray helper / system-wide mute shortcut remain later work. No remote access or public deployment was enabled.

## Implementation and validation

Background mode uses an AudioWorklet on the audio-rendering thread to send energy measurements every approximately 80 ms. Silence/turn boundaries therefore do not rely on a background setInterval timer. Its output is silent and connected through zero gain; microphone audio is not routed back to your speakers. Recorded turns still use the authenticated local transcription proxy. Contexts, tracks and worklet connections are released on mute; audio startup can be cancelled and has a timeout.

Tests use a synthetic tone through real browser AudioContext, AudioWorklet and MediaRecorder, with synthetic transcription/model/playback replies. They exercise hidden-page handling, continuation across Nexus sections, a collapsed panel with a visible mute dock, microphone release during replies, resumed listening, stop/pagehide, cancelled audio startup and same-origin window handoff. They do not certify physical ASUS microphone behavior, Windows power policies or actual inference latency.

## Automatic listening on this device

Under Nexus voice, enable **Automatically resume background listening on this device** once. This immediately starts background mode when ready and stores only an enabled/disabled preference in this browser's local storage. Audio is still transcribed and submitted automatically while listening. The choice is per browser profile and site origin: localhost and 127.0.0.1 are different, as are your phone and a second browser. Use the launcher's `http://localhost:3000/nexus` consistently.

On future page loads Nexus waits for Controller access and local transcription readiness, then checks whether microphone permission was already granted. If another same-origin Nexus window is already listening, the new automatic session stays muted. The voice status is rechecked while transcription is unavailable. The background dock appears even with the voice panel collapsed and reports waiting, blocked or active state. A manual **Resume listening** action may still be needed for browser audio/microphone policy; the app cannot bypass that restriction. Browser permission errors and service failures do not cause endless microphone retries.

**Mute Nexus**, **Stop conversation / Mute**, Ctrl+Alt+M while focused, or the spoken stop command disable the saved preference as well as stopping capture. Muting propagates to other tabs at the same origin. Re-enable the device setting when you want automatic listening again. Turning the setting off releases the microphone. A storage failure is reported and the setting then applies only to this page session.

To open Nexus after Windows sign-in, use the launcher shortcut installer with both `-AtSignIn -OpenAtSignIn`, as described in [Windows launcher setup](windows-launcher.md). Quiet startup still leaves the browser closed. This is not browser-independent listening: closed browser windows, browser suspension, signed-out Windows or a sleeping computer cannot capture through this feature. A native microphone/tray service remains separate future work. The microphone also stays off while Nexus transcribes, thinks and speaks, so interruption during an answer is not implemented.

Tests additionally cover saved automatic resume after reload, persistent explicit mute, a permission-blocked visible fallback, controller gating and avoiding takeover of an active same-origin conversation. Audio and provider calls are synthetic; physical Windows permissions, browser autoplay and sign-in remain laptop acceptance checks.
