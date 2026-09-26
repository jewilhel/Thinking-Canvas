import { describe, expect, it } from "vitest";
import {
  availableTranscriptText,
  emptyTranscript,
  markTranscriptGap,
  rememberTranscriptTurn,
  transcriptCoverage,
  TRANSCRIPT_MAX_TURNS,
} from "./conversation-transcript";
describe("volatile voice transcript", () => {
  it("keeps speech order when transcription finishes after the AI response", () => {
    let state = rememberTranscriptTurn(emptyTranscript(), {
      id: "human",
      speaker: "You",
    });
    state = rememberTranscriptTurn(state, {
      id: "ai",
      speaker: "AI",
      text: "A suggestion.",
    });
    state = rememberTranscriptTurn(state, {
      id: "human",
      speaker: "You",
      text: "Help me brainstorm.",
    });
    expect(availableTranscriptText(state)).toBe(
      "You: Help me brainstorm.\n\nAI: A suggestion.",
    );
    expect(transcriptCoverage(state)).toEqual([]);
    state = rememberTranscriptTurn(state, {
      id: "human",
      speaker: "You",
      text: "Help me brainstorm.",
    });
    expect(state.turns).toHaveLength(2);
  });
  it("discloses missing speech and interruptions without inventing content", () => {
    let state = markTranscriptGap(
      emptyTranscript(),
      "Input transcription was disabled.",
    );
    state = rememberTranscriptTurn(state, { id: "one", speaker: "You" });
    state = rememberTranscriptTurn(state, {
      id: "two",
      speaker: "AI",
      text: "An interrupted answer",
      interrupted: true,
    });
    expect(transcriptCoverage(state)).toHaveLength(3);
    expect(availableTranscriptText(state)).toContain("AI (interrupted):");
  });
  it("bounds memory and preserves a visible coverage warning", () => {
    let state = emptyTranscript();
    for (let i = 0; i <= TRANSCRIPT_MAX_TURNS; i++)
      state = rememberTranscriptTurn(state, {
        id: String(i),
        speaker: "You",
        text: "test",
      });
    expect(state.turns).toHaveLength(TRANSCRIPT_MAX_TURNS);
    expect(transcriptCoverage(state)).toContain(
      "Earlier conversation text exceeded the temporary memory limit.",
    );
    state = rememberTranscriptTurn(state, {
      id: "large",
      speaker: "AI",
      text: "x".repeat(100_001),
    });
    expect(state.turns).toHaveLength(0);
    expect(transcriptCoverage(state)).not.toHaveLength(0);
  });
});
