import { describe, expect, it } from "vitest";

import {
  buildRealtimeClientSecretRequest,
  buildStoryNarrationClientSecretRequest,
  isShortLivedRealtimeSecret,
} from "@/voice/realtime-session";

describe("buildRealtimeClientSecretRequest", () => {
  it("binds a short-lived credential to the approved bounded voice session", () => {
    expect(buildRealtimeClientSecretRequest()).toEqual({
      session: {
        type: "realtime",
        model: "gpt-realtime-2.1",
        audio: { output: { voice: "marin" } },
      },
    });
  });

  it("accepts only provider secrets that expire within ten minutes", () => {
    expect(isShortLivedRealtimeSecret(1_605, 1_000)).toBe(true);
    expect(isShortLivedRealtimeSecret(1_700, 1_000)).toBe(false);
    expect(isShortLivedRealtimeSecret(999, 1_000)).toBe(false);
  });

  it("creates an output-only narration session with verbatim instructions", () => {
    expect(buildStoryNarrationClientSecretRequest()).toEqual({
      session: {
        type: "realtime",
        model: "gpt-realtime-2.1",
        output_modalities: ["audio"],
        audio: { output: { voice: "marin" } },
        instructions:
          "Read the supplied scene narration verbatim. Do not add, remove, summarize, or answer it.",
      },
    });
  });
});
