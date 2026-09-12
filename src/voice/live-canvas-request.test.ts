import { describe, expect, it } from "vitest";
import {
  liveCanvasRequestSchema,
  voiceConversationInstruction,
  VOICE_CONVERSATION_MARKER,
} from "./live-delegation-contract";
import { liveDelegationSignature } from "./live-delegation-signature";

describe("bounded spoken canvas requests", () => {
  it("accepts bounded conversation wording without requiring command syntax", () => {
    const text = JSON.stringify({
      fragments: [
        {
          speaker: "user",
          text: "Well, can you, um, tell me what shapes are here?",
        },
      ],
    });
    expect(
      liveCanvasRequestSchema.parse({ kind: "conversation", text }),
    ).toEqual({ kind: "conversation", text });
    expect(() =>
      liveCanvasRequestSchema.parse({
        kind: "conversation",
        text: "x".repeat(16001),
      }),
    ).toThrow();
    expect(voiceConversationInstruction(text)).toContain(text);
    expect(voiceConversationInstruction(text)).toContain("explicitly requests");
    expect(VOICE_CONVERSATION_MARKER).not.toContain(text);
  });
  it("binds request text and kind to the authenticated signature", () => {
    const question = {
      kind: "conversation" as const,
      text: "Which objects overlap?",
    };
    const signature = liveDelegationSignature(
      "test-key",
      "session",
      "task",
      question,
    );
    expect(
      liveDelegationSignature("test-key", "session", "task", {
        ...question,
        kind: "comment",
      }),
    ).not.toBe(signature);
    expect(
      liveDelegationSignature("test-key", "session", "task", {
        ...question,
        text: "Different request",
      }),
    ).not.toBe(signature);
  });
});
