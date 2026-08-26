import type { FakeAiScenario } from "@/ai/fake-collaborator-gateway";

export function resolveDeterministicTestScenario(input: {
  nodeEnv: string | undefined;
  requestedScenario: string | null;
}): FakeAiScenario | undefined {
  if (input.nodeEnv !== "development" && input.nodeEnv !== "test") {
    return undefined;
  }
  return input.requestedScenario === "failed" ? "failed" : undefined;
}
