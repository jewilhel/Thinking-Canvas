import { describe, expect, it } from "vitest";

import { isDocumentApplyInstruction } from "@/ai/document-turn-intent";

describe("document turn intent", () => {
  it.each([
    "I like it, please apply the changes.",
    "Okay, make the change.",
    "Use that suggested wording.",
    "Please implement this revision.",
    "Revise document wording in the selected range.",
  ])("recognizes an approved document edit: %s", (instruction) => {
    expect(isDocumentApplyInstruction(instruction)).toBe(true);
  });

  it.each([
    "Can you improve the wording?",
    "What do you think about this paragraph?",
    "Do not apply that change.",
    "I am not ready to use that version.",
  ])("does not treat review language as approval: %s", (instruction) => {
    expect(isDocumentApplyInstruction(instruction)).toBe(false);
  });
});
