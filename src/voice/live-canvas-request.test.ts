import { describe, expect, it } from "vitest";
import { parseLiveCanvasRequest } from "./live-delegation-contract";
import { liveDelegationSignature } from "./live-delegation-signature";

describe("bounded spoken canvas requests", () => {
  it.each([
    "Can you tell me what kind of shapes are on the canvas?",
    "Which objects overlap?",
    "Can you tell what kind of shapes?",
    "Please explain the canvas.",
    "What is in the document?",
    "Describe this canvas.",
  ])("preserves the actual question: %s", (text) => {
    expect(parseLiveCanvasRequest(text)).toEqual({ kind: "question", text });
  });
  it.each([
    "Leave a comment on Jason saying the label is clear.",
    "Could you add a comment about the overlapping shapes?",
  ])("accepts explicit contextual comments: %s", (text) => {
    expect(parseLiveCanvasRequest(text)).toEqual({ kind: "comment", text });
  });
  it.each([
    "Delete the canvas",
    "Move Jason to the left",
    "I might leave a comment later",
    "Don't leave a comment",
    "Actually, leave a comment",
    "Hello there",
    "a".repeat(2001),
  ])(
    "does not execute unsupported, tentative, cancelled, or oversized speech",
    (text) => {
      expect(parseLiveCanvasRequest(text)).toBeNull();
    },
  );
  it("binds request text and kind to the authenticated signature", () => {
    const question = {
      kind: "question" as const,
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
