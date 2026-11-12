# Nexus personal assistant interface

The November 11 interface increment moves conversation ownership into the shared application layout. This is a UI and browser-session improvement, not a native Windows agent installation or new external-action permission.

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

The browser microphone stays off while Nexus thinks and speaks. Voice interruption during playback, OS-wide invocation, wake-word detection and a Windows microphone service remain separate implementation work. No Google write, Gmail sending, banking, payment, marketing spend or arbitrary shell capability is introduced.

## Verification and laptop acceptance

Browser tests cover draft/answer preservation, one voice controller, real synthetic AudioWorklet capture across client-side routes, mute/release, saved auto-resume behavior, loss of controller access, focused connection categories, existing co-hosting/Gemini behavior and desktop/mobile sizing. Synthetic browser audio does not establish laptop microphone quality or Windows background availability.

For installation, stop the identified old Next server before rebuilding, then run the existing Windows launcher. Open Nexus, confirm the Overview and emerald theme, start a voice session, minimize it, move to Mission Control and back, and confirm the floating mute control works. Check Google accounts, selected Google files, laptop files and maintenance through their new categories. Existing credentials and source selections are not migrated by this UI increment.

Cloud verification, November 12: production build and TypeScript passed. The full 444-scenario browser run initially recorded 429 passes, eight skips and seven failures. After correcting the category selectors, avoiding unauthorized pre-pairing requests and moving the dashboard launcher away from resize handles, all 102 affected desktop/mobile regression scenarios passed. The local runtime protocol, setup decisions, connection diagnostic, launcher decisions, ten Gemini diagnostic cases and ten Python voice protocol tests also passed using fixtures. No real provider inference or Windows microphone acceptance is claimed by those tests.
