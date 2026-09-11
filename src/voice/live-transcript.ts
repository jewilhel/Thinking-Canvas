import { z } from "zod";
import type { ConversationTranscript } from "./conversation-transcript";
const fragmentSchema = z.object({
  type: z.enum([
    "session.input_transcript.delta",
    "session.output_transcript.delta",
  ]),
  event_id: z.string().min(1).max(512),
  delta: z.string().max(100_000),
  start_ms: z.number().min(0).max(86_400_000),
  end_ms: z.number().min(0).max(86_400_000),
});
type Fragment = {
  id: string;
  speaker: "You" | "AI";
  text: string;
  start: number;
  end: number;
};
/** Display grouping is revisable; it never drives task execution or turn completion. */
export class LiveTranscript {
  private fragments: Fragment[] = [];
  private seen = new Set<string>();
  private gaps = new Set<string>();
  private floor = -1;
  markGap(reason: string) {
    if (this.gaps.size < 20) this.gaps.add(reason);
  }
  append(value: unknown, generation: string, offset: number) {
    const parsed = fragmentSchema.safeParse(value);
    if (!parsed.success) return;
    const e = parsed.data,
      id = `${generation}:${e.event_id}`;
    if (this.seen.has(id)) return;
    const start = offset + e.start_ms;
    if (start < this.floor || e.end_ms < e.start_ms) {
      this.markGap("Late or invalid fragments could not be included.");
      return;
    }
    this.seen.add(id);
    this.fragments.push({
      id,
      text: e.delta,
      speaker: e.type === "session.input_transcript.delta" ? "You" : "AI",
      start,
      end: offset + e.end_ms,
    });
    this.fragments.sort((a, b) => a.start - b.start);
    let characters = this.fragments.reduce((n, f) => n + f.text.length, 0);
    while (this.fragments.length > 2000 || characters > 100_000) {
      const removed = this.fragments.shift()!;
      characters -= removed.text.length;
      this.seen.delete(removed.id);
      this.floor = Math.max(this.floor, removed.start + 1);
      this.markGap(
        "Earlier conversation text exceeded the temporary memory limit.",
      );
    }
  }
  snapshot(): ConversationTranscript {
    const turns: ConversationTranscript["turns"] = [];
    let previousEnd = -Infinity;
    for (const f of this.fragments) {
      const last = turns.at(-1);
      if (last && last.speaker === f.speaker && f.start - previousEnd < 5000)
        last.text += f.text;
      else
        turns.push({
          id: f.id,
          speaker: f.speaker,
          text: f.text,
          interrupted: false,
        });
      previousEnd = f.end;
    }
    return {
      turns,
      gaps: [
        ...this.gaps,
        "Live captions are temporary fragments; AI text does not prove every word was heard.",
      ],
    };
  }
}
