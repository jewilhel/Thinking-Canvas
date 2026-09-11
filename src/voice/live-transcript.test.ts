import { describe, expect, it } from "vitest";
import { LiveTranscript } from "./live-transcript";
const input = (id: string, delta: string, start: number) => ({
  type: "session.input_transcript.delta",
  event_id: id,
  delta,
  start_ms: start,
  end_ms: start + 100,
});
describe("Live fragments", () => {
  it("keeps literal spaces and repeated words while deduplicating event IDs", () => {
    const transcript = new LiveTranscript();
    transcript.append(input("1", "yes ", 0), "run", 0);
    transcript.append(input("2", "yes", 100), "run", 0);
    transcript.append(input("2", "yes", 100), "run", 0);
    expect(transcript.snapshot().turns.map((t) => t.text)).toEqual(["yes yes"]);
  });
  it("revises display order for late and overlapping speaker fragments", () => {
    const transcript = new LiveTranscript();
    transcript.append(input("2", "after", 200), "run", 0);
    transcript.append(
      { ...input("3", "okay", 100), type: "session.output_transcript.delta" },
      "run",
      0,
    );
    transcript.append(input("1", "before", 0), "run", 0);
    expect(transcript.snapshot().turns.map((t) => [t.speaker, t.text])).toEqual(
      [
        ["You", "before"],
        ["AI", "okay"],
        ["You", "after"],
      ],
    );
  });
});
