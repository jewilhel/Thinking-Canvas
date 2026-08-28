import { describe, expect, it } from "vitest";

import { plainLanguageAiReply } from "@/ai/reply-copy";

describe("plainLanguageAiReply", () => {
  it("keeps ordinary product language", () => {
    expect(
      plainLanguageAiReply(
        "I created five labeled sticky notes in the requested colors.",
      ),
    ).toBe("I created five labeled sticky notes in the requested colors.");
  });

  it.each([
    "I changed object.move for 61000000-0000-4000-8000-000000000001.",
    "Prepared for tentative review as one change set.",
    "The tool call returned two UUIDs.",
  ])("replaces implementation detail in persisted reply copy", (body) => {
    expect(plainLanguageAiReply(body)).toBe(
      "I completed the request using the current canvas context.",
    );
  });
});
