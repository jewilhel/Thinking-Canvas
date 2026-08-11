import { describe, expect, it } from "vitest";

import {
  buildRealtimeClientSecretRequest,
  REALTIME_CLIENT_SECRET_TTL_SECONDS,
} from "@/voice/realtime-session";

describe("buildRealtimeClientSecretRequest", () => {
  it("binds a short-lived credential to the approved bounded voice session", () => {
    expect(buildRealtimeClientSecretRequest()).toEqual({
      expires_after: {
        anchor: "created_at",
        seconds: REALTIME_CLIENT_SECRET_TTL_SECONDS,
      },
      session: {
        type: "realtime",
        model: "gpt-realtime-2.1",
        instructions: expect.stringContaining("do not claim that you changed"),
        max_output_tokens: 256,
        audio: { output: { voice: "marin" } },
      },
    });
    expect(REALTIME_CLIENT_SECRET_TTL_SECONDS).toBeLessThanOrEqual(60);
  });
});
