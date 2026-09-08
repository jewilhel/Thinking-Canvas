import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("sharp", () => {
  throw new Error("Native image runtime is unavailable.");
});

describe("AI run service loading", () => {
  it("keeps text, cancel, and retry handlers independent from image rendering", async () => {
    const service = await import("@/ai/collaborator-run-service");

    expect(service.completeAiRun).toBeTypeOf("function");
    expect(service.cancelAiRun).toBeTypeOf("function");
    expect(service.retryAiRun).toBeTypeOf("function");
  });
});
