// Provider messages, metadata, URLs and headers never become user-facing diagnostics.
// Only HTTP status and an exact allowlisted machine-code value are exposed.
const REASONS: Record<string, string> = {
  paid_plan_required:
    "This voice or model requires an eligible paid API plan. Check the account plan before purchasing anything.",
  payment_required:
    "The API account requires a billing or credit update. Review the account's pricing and balance.",
  quota_exceeded:
    "The API account or key allowance is exhausted. Review provider credits and key limits.",
  insufficient_credits:
    "The API account has insufficient credits. Review its balance and pricing.",
  character_limit_exceeded:
    "The provider account or API key character allowance was exceeded. Review the key and account limits.",
  voice_not_found:
    "Stephanie is not accessible to this API key. Add the selected voice to My Voices in the same account.",
  invalid_voice_id:
    "The selected voice ID was rejected. Verify Stephanie's current API voice ID.",
  voice_not_allowed:
    "This API account is not permitted to generate speech with the selected voice. Check voice eligibility.",
  model_not_found:
    "The configured speech model was rejected. Verify the model is available for this account and voice.",
  invalid_model_id:
    "The configured speech model ID was rejected. Verify current model availability.",
  model_not_supported:
    "The selected model is not supported for this request. Verify voice/model compatibility.",
  voice_model_not_supported:
    "The voice and model combination is not supported. Verify voice/model compatibility.",
  model_deprecated:
    "The configured model has been retired. Review supported models before updating the adapter.",
  invalid_api_key:
    "The API key was rejected. Create or copy a current key into the hidden laptop setup prompt.",
  missing_permissions:
    "The key lacks a required permission. Check Text to Speech and Voices read permissions.",
  rate_limit_exceeded:
    "The provider rate limit was reached. Wait before retrying; no automatic retry was made.",
  too_many_concurrent_requests:
    "The provider account has too many concurrent requests. Wait before retrying.",
  system_busy: "The provider is temporarily busy. No automatic retry was made.",
  detected_unusual_activity:
    "The provider has restricted this account's API usage. Review account notices or contact provider support.",
};
export async function redactedElevenError(response: Response) {
  let reason: string | undefined;
  const reader = response.body?.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (reader) {
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          void reader.cancel().catch(() => {});
          reject(Error("timeout"));
        }, 2000);
      });
      const read = async () => {
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 16000) throw Error("oversized");
          chunks.push(value);
        }
        const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        const candidates = [
          data?.detail?.status,
          data?.detail?.code,
          data?.error?.code,
          data?.status,
        ];
        reason = candidates.find(
          (v) => typeof v === "string" && Object.hasOwn(REASONS, v),
        );
      };
      await Promise.race([read(), timeout]);
    }
  } catch {
    /* An unknown or unreadable body is intentionally discarded. */
  } finally {
    if (timer) clearTimeout(timer);
    await reader?.cancel().catch(() => {});
  }
  const hint = reason
    ? REASONS[reason]
    : response.status === 401 || response.status === 403
      ? "ElevenLabs rejected access. Check API key permissions, Stephanie voice access and account eligibility."
      : response.status === 402
        ? "The provider requires a billing or account-plan update. Check API credits and voice eligibility."
        : response.status === 429
          ? "ElevenLabs quota or rate limit reached. No automatic retry was made."
          : response.status === 400 || response.status === 422
            ? "The provider rejected the speech request. Verify the selected voice, model and account compatibility."
            : response.status === 404
              ? "The selected provider resource was not found. Verify current voice and model availability."
              : "The provider could not generate speech. Review its service status and account notices.";
  return `ElevenLabs HTTP ${response.status}${reason ? " · " + reason.toUpperCase() : ""}. ${hint}`;
}
