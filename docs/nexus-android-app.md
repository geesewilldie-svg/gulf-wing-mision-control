# Nexus Android app foundation

The first Android delivery is an installable web app backed by the existing Nexus host. Visit `/phone` for setup instructions, also linked under Connections → Device access. The manifest opens `/nexus` in a standalone window with cyan/navy app icons. Chrome supplies installation when eligible; dismissal and manual installation remain supported. There is no service worker or offline cache of private answers. This is not an APK, Play Store release or Android Auto application.

## Connection prerequisites

A phone must reach the same Nexus host using a trusted HTTPS origin. `localhost:3000` on the phone is the phone itself; a laptop LAN HTTP address does not provide browser microphone access. A private network such as Tailscale plus trusted HTTPS termination is a possible deployment. It is not provisioned by this update. Verify account/device ownership and host OS before configuring it; do not forward port 3000 publicly. Pair the phone as a controller, then enable the chosen speech engine and per-session cloud speech consent. Existing authentication, external sharing and daily allowances remain in effect across controllers.

## Always-on host acceptance

Choose the actual host before migrating. Install the supported Node runtime, application and local AI/voice dependencies; verify Windows DPAPI compatibility before moving encrypted credentials. Copying a DPAPI file to a different user/computer does not unlock it: recreate provider credentials through secure setup on the destination. Back up private state and verify restore before switching host authority. Keep one authoritative data store; do not run divergent writable copies. Confirm startup after reboot, power/sleep behavior, network recovery, private HTTPS reachability from cellular, device revocation and backup recovery. A cloud server does not automatically control home devices.

## Limits and next milestones

The host must remain running and reachable. Android can suspend browser microphone/audio with the screen off or app backgrounded. Push notifications, native background services, wake word, offline inference, native device control, CarPlay/Android Auto and direct stereo installation are not implemented. A dedicated Android client can follow once real phone pairing/audio acceptance establishes the shared API behavior. TVs and other devices require individual adapters with verified capabilities and owner authorization.

## Verification

Production build plus desktop/mobile manifest, install-event and layout checks cover this foundation. Real Android installation, HTTPS networking, microphone/audio, lock-screen behavior and vehicle compatibility require device acceptance; desktop browser emulation does not establish them.
