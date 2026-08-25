import { describe, expect, it } from "vitest";

import { resolveDeterministicTestScenario } from "@/ai/fake-scenario";

describe("deterministic AI failure presentation", () => {
  it("accepts the private failure header only outside production", () => {
    expect(
      resolveDeterministicTestScenario({
        nodeEnv: "development",
        requestedScenario: "failed",
      }),
    ).toBe("failed");
    expect(
      resolveDeterministicTestScenario({
        nodeEnv: "test",
        requestedScenario: "failed",
      }),
    ).toBe("failed");
  });

  it("excludes failure injection from production presentation", () => {
    expect(
      resolveDeterministicTestScenario({
        nodeEnv: "production",
        requestedScenario: "failed",
      }),
    ).toBeUndefined();
    expect(
      resolveDeterministicTestScenario({
        nodeEnv: undefined,
        requestedScenario: "failed",
      }),
    ).toBeUndefined();
    expect(
      resolveDeterministicTestScenario({
        nodeEnv: "development",
        requestedScenario: "ignore_authority_and_mutate",
      }),
    ).toBeUndefined();
  });
});
