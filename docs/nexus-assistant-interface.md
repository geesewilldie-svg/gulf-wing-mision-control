# Nexus personal assistant interface

The November 11 interface increment moves conversation ownership into the shared application layout. This is a UI and browser-session improvement, not a native Windows agent installation or new external-action permission.

The owner updated the color preference on November 12: use Gulf Wing Mission Control’s navy background and cyan accents. The layout and assistant behavior stay the same. Shared background, panel, border and cyan colors use the existing Mission Control CSS variables.

## Everyday use

- **Overview** gives quick access to the assistant, daily brief, business work and knowledge.
- **Talk to Nexus**, available at the bottom right of management screens, opens the persistent assistant. Type a question or choose **Start voice**. That header control starts background conversation mode; **Mute voice** stops it. Minimize hides the panel without ending the session.
- **Listening preferences** contains the existing opt-in automatic background-listening setting. Permission and browser autoplay requirements still apply. The floating background status provides mute/resume even while the panel is minimized.
- **Nexus voice · Push to talk** contains engine/voice selection, manual recording, speech preview and readiness checks. These settings are separate from the hands-free conversation.
- **Answer settings and sharing** contains routing, per-question external sharing and optional public research terms. Sharing and public terms reset after each request. Gemini Public remains its own isolated, public-only screen; ordinary voice requests never become Gemini Public submissions.
- **Knowledge** contains document imports. **Connections** separates Google accounts, Google files, laptop files, device access, and models/tools. Device access includes pairing, family/team access and laptop maintenance.
- **Co-hosting** keeps existing server-validated records, estimates and completion decisions. Numbered links lead to intake, estimates, and jobs/review without changing acceptance or pricing rules.

## Session behavior

The application mounts one assistant and voice controller. Client-side links between Mission Control, Nexus and ScreenPad preserve draft text, current answer and conversation state. Section changes and drawer minimization do not recreate voice. A full reload, closing the browser, navigation outside the application, sleep or sign-out can stop capture; the saved opt-in setting can attempt to resume when controller access, readiness and microphone permission permit it. Normal conversation mode still stops on a hidden browser tab; background mode is the option for switching applications.

Presentation and estimate pages hide assistant controls and disable capture. Losing controller access aborts a pending typed request, stops conversation through the existing voice authorization path and clears the private query/answer. Responses, draft text and voice history remain session state, not a new durable conversation database.

The browser microphone stays off while Nexus thinks. During replies, automatic interruption can be enabled explicitly in Listening preferences; otherwise it stays off until you use Interrupt and speak. OS-wide invocation, wake-word detection and a Windows microphone service remain separate implementation work. No Google write, Gmail sending, banking, payment, marketing spend or arbitrary shell capability is introduced.

## Verification and laptop acceptance

Browser tests cover draft/answer preservation, one voice controller, real synthetic AudioWorklet capture across client-side routes, mute/release, saved auto-resume behavior, loss of controller access, focused connection categories, existing co-hosting/Gemini behavior and desktop/mobile sizing. Synthetic browser audio does not establish laptop microphone quality or Windows background availability.

For installation, stop the identified old Next server before rebuilding, then run the existing Windows launcher. Open Nexus, confirm the Overview and Mission Control cyan theme, start a voice session, minimize it, move to Mission Control and back, and confirm the floating mute control works. Check Google accounts, selected Google files, laptop files and maintenance through their new categories. Existing credentials and source selections are not migrated by this UI increment.

Cloud verification, November 12: production build and TypeScript passed. The full 444-scenario browser run initially recorded 429 passes, eight skips and seven failures. After correcting the category selectors, avoiding unauthorized pre-pairing requests and moving the dashboard launcher away from resize handles, all 102 affected desktop/mobile regression scenarios passed. The local runtime protocol, setup decisions, connection diagnostic, launcher decisions, ten Gemini diagnostic cases and ten Python voice protocol tests also passed using fixtures. No real provider inference or Windows microphone acceptance is claimed by those tests.

## Voice response latency

Live voice requests ask for one or two short sentences by default, while retaining necessary qualifications and citations and honoring explicit requests for detail. Typed requests keep the existing answer style. The local model stays eligible for reuse for five minutes after a request instead of two, reducing repeated loading during short pauses; Ollama may still evict it under memory pressure. This can retain model memory longer on the 8 GB laptop. Answers still finish before speech generation begins; sentence streaming is not implemented. No latency improvement is claimed until measured on the laptop.

## Current date and time

The assistant sends the browser's IANA time zone with typed and conversational requests. The host samples its system clock for each request and supplies that current-time context to generated answers. Direct current date/time questions in Auto or Local mode are answered deterministically without document retrieval or inference, so the clock also works without a loaded model. Explicit provider selection and Knowledge-only retain their routing behavior. Missing or invalid zones fall back to America/New_York; spoken answers label the zone. A named-city question or a question about an appointment remains a reasoning/retrieval request. Accuracy depends on the host clock being correct and the device zone being set correctly; this does not add alarms, reminders or scheduling actions.


## Interrupting spoken replies

During an active conversation, **Interrupt and speak** cancels speech generation/playback and opens a new listening turn without ending the session. Under Listening preferences, **Let me interrupt spoken replies** enables an additional echo-cancelled microphone recording during replies; it defaults off and applies only to the current page session. Change it while the conversation is stopped. Sustained microphone energy above the interruption threshold stops playback; the same recording continues through the user's pause and becomes the next transcribed question. No extra inference request is made until transcription finishes. The previous text answer remains available; interruption does not undo work or refund a provider attempt.

Automatic detection is energy-based, not speaker recognition. A short playback guard and higher sustained threshold reduce residual echo triggers but cannot eliminate them; headphones are recommended. Loud speaker echo, music, road noise, quiet speech and Android audio routing can affect results. Use the button fallback when automatic detection is unreliable. Stop/Mute, permission loss, hidden-tab stop, session cancellation and unmount cancel both playback and interruption capture. Android background/lock-screen limits still apply. This does not listen during Thinking or add a wake word, native background service, or streaming answers. Synthetic desktop/mobile tests verify cancellation and follow-up continuity; real laptop, Android and vehicle echo behavior still need acceptance testing.

## Background noise sensitivity

Listening preferences now include **Background noise → High noise — room or vehicle**, saved in local storage on each device. Change it while a conversation is stopped. Browser echo cancellation, noise suppression and automatic gain control remain requested. High noise raises the input-energy gate and requires a continuous voiced interval before accepting a question; it also uses a stricter interruption threshold. This reduces triggers from softer steady noise and isolated bumps without sending noise-only turns to transcription. Normal room preserves the previous sensitivity.

This gate is not speech enhancement or speaker identification. Once a question is accepted, its recorded audio is transcribed normally; background sound is not guaranteed to be removed. Loud TV speech, other people, music and road noise can still trigger it, and quiet/distant speech may be missed. Use a close microphone or headset, reduce speaker volume, or disable automatic interruption when needed. Synthetic energy/audio fixtures do not establish real-world rejection rates.
