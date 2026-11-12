# Optional ElevenLabs voice: Stephanie

Owner-selected voice: **Stephanie**, ID `oT5lntmfa8t37GiBBd3k`. The name is the owner's label; the setup checks that this ID is accessible through the supplied account. No actor imitation, sample cloning, new voice upload or provider subscription is created by this integration.

## Setup on the Windows laptop

1. Add the selected voice to My Voices in ElevenLabs. Check API eligibility, pricing, voice terms and the account's privacy/data settings. Web-app access alone does not establish API access or commercial redistribution rights. Current prices and this account's voice/model entitlements have not been independently verified.
2. Create a restricted API key with Text to Speech permission and Voices read access. Do not paste it into chat, browser forms, environment arguments or source code.
3. Run `Setup-Nexus-ElevenLabs.cmd`. It explains cloud disclosure and asks for explicit `YES`, a daily character limit (default 1,000) and a hidden API key. It performs one fixed voice metadata GET and stores only a Windows CurrentUser DPAPI-protected secret in the ignored private `.gulf-wing/elevenlabs.json` directory. UTF-8 BOM and UTF-16LE PowerShell pipe input are supported. No generation, purchase, billing change or model download occurs during setup. Failed validation preserves the existing configuration.
4. In Talk to Nexus, expand **Nexus voice · Push to talk**, choose **Refresh ElevenLabs status**, then select **ElevenLabs · Stephanie** in Speech engine. Check the cloud-speech control before previewing or starting conversation. Selection and sharing are session state; reloading returns to the existing local-first default. Cloud speech never becomes an automatic fallback.
5. Begin with the short voice preview. It is a real generation request and can use paid credits. Test audio quality, playback and latency on the laptop. Conversation transcription still uses the existing local worker.

## What is sent and how it is bounded

Only the selected text to speak and fixed model identifier are sent to `https://api.elevenlabs.io/v1/text-to-speech/oT5lntmfa8t37GiBBd3k`. Text can include private assistant replies or morning-brief content; choosing cloud speech discloses those texts to ElevenLabs. The provider receives plaintext and applies its own account terms. No direct document collection, user history, credential store or microphone recording is added to the speech request. Gemini Public's separate boundary is unchanged.

The fixed model is `eleven_flash_v2_5`, with `mp3_44100_128` output. Setup checks voice metadata; generation-time account/model availability can still fail. The current browser path buffers a bounded MP3 before playback. It is not yet incremental streaming playback, and no latency improvement over Kokoro is claimed without a native audition.

Every generation requires server-checked `cloudSpeechConsent: true` and paired-controller/same-origin authorization. Display devices cannot read its private setup metadata or generate speech. Input is limited to 3,000 UTF-16 code units and a bounded JSON body; responses are limited to 8 MB and must have the expected audio content type. A global slot prevents concurrent cloud generation in one server process; a filesystem reservation lock protects shared allowance updates across processes. Redirects are rejected and the provider URL, voice and model cannot be selected by browser request fields.

A persistent **UTC-day character allowance** is reserved before provider dispatch. Failed, cancelled and timed-out attempts retain their reservation because the provider may have processed them. The limit is shared by trusted paired controllers and is an application text-length cap, **not a dollar spending cap**, a provider billing measurement, or a limit on other applications using the account. Unicode/billing units, model prices and other account usage can differ. No retries, paid-provider switching or silent local fallback occur on failure. Corrupt configuration/accounting fails closed.

`elevenlabs-allowance.json` contains date/count only, never speech text or key. A crashed accounting update can leave `elevenlabs-allowance.lock`; stop all Nexus servers before investigating that lock. Do not delete/reset allowance files to claim an account-level budget guarantee. Setup and runtime errors use fixed messages rather than exposing provider error bodies, headers or credentials.

## Stop, disable and fallback

Mute or Stop speech aborts pending browser speech work; a provider may already have billed it. Ending a hands-free session clears the cloud-sharing checkbox. Reload, sign-out/loss of controller access and engine changes also require renewed session selection/sharing.

**Disable ElevenLabs** in voice settings mutes the current conversation, disables future cloud speech and aborts the server's active cloud request where possible. `Disable-Nexus-ElevenLabs.cmd` disables future calls from the laptop configuration; it cannot undo a request already accepted by the provider. The credential remains encrypted for a later explicit setup. Revoke the key in ElevenLabs to revoke provider access itself.

Kokoro Isabella, Piper and device speech remain selectable; no local voice installation is replaced. The current trusted-controller installation is not tenant isolation or a multi-customer paid-voice product. Commercial voice rights, customer scopes, provider terms and usage accounting need their own production review.

## Evidence

On November 12, 2026, read-only official SDK source confirmed the text-to-speech and voice-metadata endpoint paths and documented speech model/output examples:

- [ElevenLabs official Python SDK](https://github.com/elevenlabs/elevenlabs-python)
- [TTS transport](https://github.com/elevenlabs/elevenlabs-python/blob/main/src/elevenlabs/text_to_speech/raw_client.py)
- [Voice metadata transport](https://github.com/elevenlabs/elevenlabs-python/blob/main/src/elevenlabs/voices/raw_client.py)

These moving upstream links support the integration shape, not a claim of account entitlement or verified prices. The pricing and selected voice pages were blocked by the environment's proxy. Automated tests use synthetic metadata/audio/transports and verify consent, auth, budget persistence, redaction, abort/disable, invalid audio and UI routing. A successful live Stephanie audition remains a laptop acceptance step.
