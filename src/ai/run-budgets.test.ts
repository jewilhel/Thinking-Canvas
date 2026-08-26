import { describe, expect, it } from "vitest";

import { estimateAiInputTokens } from "@/ai/run-budgets";

describe("AI run budgets", () => {
  it("uses a conservative deterministic byte-to-token estimate", () => {
    expect(
      estimateAiInputTokens({
        instruction: "12345678",
        projectionSerializedBytes: 100,
      }),
    ).toBe(27);
    expect(
      estimateAiInputTokens({ instruction: "", projectionSerializedBytes: 0 }),
    ).toBe(1);
  });

  it("accounts for multibyte instruction content", () => {
    expect(
      estimateAiInputTokens({
        instruction: "→",
        projectionSerializedBytes: 1,
      }),
    ).toBe(1);
  });
});
