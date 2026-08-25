import { describe, expect, it } from "vitest";

import {
  FIXED_AI_EVALUATION_FIXTURES,
  summarizeCandidateEvaluation,
} from "@/ai/evaluation-suite";

function observations(failedFixtureIds: string[] = [], critical = false) {
  return FIXED_AI_EVALUATION_FIXTURES.map((fixture, index) => ({
    fixtureId: fixture.id,
    passed: !failedFixtureIds.includes(fixture.id),
    criticalUngroundedClaim: critical && index === 0,
    latencyMs: 100,
    inputTokens: 200,
    outputTokens: 50,
    estimatedCostUsd: 0.001,
    providerRequestId: `request-${index}`,
    notes: "Deterministic evaluation observation.",
  }));
}

describe("fixed AI evaluation suite", () => {
  it("contains every mandatory security category and ten quality fixtures", () => {
    const security = FIXED_AI_EVALUATION_FIXTURES.filter(
      (fixture) => fixture.kind === "security",
    );
    const quality = FIXED_AI_EVALUATION_FIXTURES.filter(
      (fixture) => fixture.kind === "quality",
    );
    expect(security.map((fixture) => fixture.category).sort()).toEqual([
      "cancellation",
      "malformed_tool",
      "nonexistent_object",
      "permission_denial",
      "prompt_injection",
    ]);
    expect(quality).toHaveLength(10);
  });

  it("passes only when security is perfect, quality reaches 90%, and no critical claim exists", () => {
    expect(
      summarizeCandidateEvaluation({
        candidate: "gpt-5.6-terra",
        reasoningEffort: "medium",
        fixtureSetVersion: 1,
        observations: observations(["quality-praise-trap"]),
      }),
    ).toMatchObject({
      securityPassRate: 1,
      qualityPassRate: 0.9,
      passed: true,
      totalLatencyMs: 1_500,
      totalInputTokens: 3_000,
      totalOutputTokens: 750,
    });
    expect(
      summarizeCandidateEvaluation({
        candidate: "gpt-5.6-terra",
        reasoningEffort: "medium",
        fixtureSetVersion: 1,
        observations: observations(["security-prompt-injection"]),
      }).passed,
    ).toBe(false);
    expect(
      summarizeCandidateEvaluation({
        candidate: "gpt-5.6-terra",
        reasoningEffort: "medium",
        fixtureSetVersion: 1,
        observations: observations([], true),
      }).passed,
    ).toBe(false);
  });

  it("rejects missing, duplicate, and non-candidate observations", () => {
    expect(() =>
      summarizeCandidateEvaluation({
        candidate: "gpt-5.6-terra",
        reasoningEffort: "medium",
        fixtureSetVersion: 1,
        observations: observations().slice(1),
      }),
    ).toThrow("Every fixed");
    const duplicate = observations();
    duplicate[1] = { ...duplicate[1], fixtureId: duplicate[0].fixtureId };
    expect(() =>
      summarizeCandidateEvaluation({
        candidate: "gpt-5.6-terra",
        reasoningEffort: "medium",
        fixtureSetVersion: 1,
        observations: duplicate,
      }),
    ).toThrow("unique fixed fixtures");
    expect(() =>
      summarizeCandidateEvaluation({
        candidate: "unapproved-model",
        reasoningEffort: "medium",
        fixtureSetVersion: 1,
        observations: observations(),
      }),
    ).toThrow();
  });
});
