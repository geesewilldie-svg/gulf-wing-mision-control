# Haudio stereo — deferred vehicle setup

Recorded November 19, 2026 from the owner's packaging/back-label photographs and screenshots of the FCC-filed manual. The unit is not yet installed or powered for acceptance testing. Preserve this record for installation day.

## Identifiers and evidence

- Retail branding: Haudio, 10.1-inch capacitive touchscreen.
- Manufacturer label: Lightcomm Technology Co., Ltd.; FCC ID XMF-CVD1662.
- FCC product/model record: CVD1662. The separate barcode inventory label is not proof of a model number.
- Manual: https://fccid.io/XMF-CVD1662/User-Manual/Users-Manual-7605423 (12 pages; document 7605423; FCC filing August 27, 2024).
- User-supplied screenshots explicitly list Android 12.0, 2 GB DDR RAM, 32/64 GB flash variants, 1280×720 display, Wi-Fi/mobile-hotspot internet access, APK download/installation/removal, Android/iOS phone Mirrorlink, Bluetooth A2DP and Bluetooth 4.0. Actual storage variant has not been established.
- Rear labels show GPS, ANT and a position marked 4G. A printed 4G position is not proof of an installed modem, SIM support or service.

## Proposed Nexus path — not yet verified on this hardware

Use the stereo as an Android client; retain AI inference and local voice processing on the existing Nexus host. Once installed and parked, connect it to the phone hotspot, verify the actual Android version/browser, and establish private Tailscale connectivity. Install Tailscale and a supported browser only from verified distribution sources if supported. Then open the existing host's private HTTPS Nexus address, pair as a controller, and test screen layout, microphone access, playback, Isabella/Jessica consent, interruption and High noise mode. Do not rotate pairing merely to add this device if the current pairing code is available.

A Nexus native APK is not currently built. APK support makes direct client installation a viable investigation, not proof that this web app or a particular browser will run correctly. Play Store availability, browser/WebView compatibility, headset/external-microphone routing, background behavior, hotspot plus phone-link coexistence, boot reconnection and actual Android Auto/CarPlay support remain unverified. Mirrorlink is not equivalent to Android Auto app support. No car control or vehicle-bus integration is implemented.
