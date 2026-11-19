export class IncompletePlanError extends Error {
  constructor(
    public partial: string,
    reason = "Planning response reached its generation limit; the saved draft needs review.",
  ) {
    super(reason);
  }
}
export const nexusPlanningFacts = `Nexus is a real, implemented personal assistant, not a fictional or hypothetical app.
It is hosted on the owner's Windows computer; that host must be awake and reachable.
Its Android client is an installable Chrome web app connected through private Tailscale HTTPS. There is no native Nexus APK or implemented Android Auto integration.
Access uses Connect devices and a laptop pairing code with controller/display roles. Nexus has no Facebook login, public sign-up or Nexus username/password registration.
Voice uses a local transcription worker and local Kokoro Isabella or optional ElevenLabs Jessica. Cloud speech needs per-session consent and allowance; local Isabella does not use ElevenLabs credits.
Listening preferences include opt-in spoken interruption and per-device High noise. These reduce false triggers but do not guarantee isolation from other voices. Android may suspend background/locked-screen capture.
Task creation/listing/steering uses the Foundation store and selected workspace. Planning completion does not prove external actions. Calendar/Drive are separate read-only integrations; Gmail and general computer execution are not implemented.
These are implemented feature descriptions, not a live health check or proof a device/account is currently connected. Do not invent menus or capabilities beyond this evidence.`;
export function planningIssues(output: string, objective: string): string[] {
  const issues: string[] = [];
  if (
    /\bnexus\b/i.test(objective) &&
    !/\b(?:fictional|hypothetical)\b/i.test(objective) &&
    /\bnexus\s+(?:is|was|would be)\s+(?:(?:a|an|purely|just|only)\s+){0,3}(?:fictional|hypothetical)\b/i.test(
      output,
    )
  )
    issues.push(
      "The draft incorrectly describes the implemented Nexus application as fictional or hypothetical.",
    );
  if ((output.match(/```/g) || []).length % 2)
    issues.push("The draft contains an unfinished code block.");
  return issues;
}
