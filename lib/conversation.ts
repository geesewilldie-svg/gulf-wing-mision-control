export type ConversationTurn = { role: "user" | "assistant"; content: string };

// Local energy detector only: audio is sent for transcription after a voiced turn.
export class SpeechBoundary {
  private previous: number;
  private voiced = 0;
  private lastVoice: number;
  heardSpeech = false;
  constructor(
    private start: number,
    private pause = 1400,
  ) {
    this.previous = this.lastVoice = start;
  }
  sample(rms: number, now: number): "speech" | "idle" | "limit" | null {
    const delta = Math.max(0, Math.min(now - this.previous, 150));
    this.previous = now;
    if (rms >= 0.018) {
      this.voiced += delta;
      this.lastVoice = now;
      if (this.voiced >= 160) this.heardSpeech = true;
    }
    if (now - this.start >= 30000) return this.heardSpeech ? "limit" : "idle";
    return this.heardSpeech && now - this.lastVoice >= this.pause
      ? "speech"
      : null;
  }
}

export function parseHistory(value: unknown): ConversationTurn[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 4)
    throw new Error("Use up to four recent conversation messages.");
  return value.map((item) => {
    if (
      !item ||
      !["user", "assistant"].includes(item.role) ||
      typeof item.content !== "string" ||
      !item.content.trim() ||
      item.content.length > 800
    )
      throw new Error("Invalid conversation history.");
    return { role: item.role, content: item.content };
  });
}
