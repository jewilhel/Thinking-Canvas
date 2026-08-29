import { describe, expect, it, vi } from "vitest";

import {
  requestPrimaryAiWithRetry,
  type PrimaryAiGateway,
} from "@/ai/primary-ai-gateway";

const requestInput = {
  invocation: {} as never,
  projection: {} as never,
  allowedToolNames: [],
};

describe("requestPrimaryAiWithRetry", () => {
  it("retries one provider failure before returning a completed response", async () => {
    const completed = {
      status: "completed" as const,
      requestId: "request-2",
      reply: { body: "Done", evidence: [], contextualTargetObjectIds: [] },
      toolCalls: [],
    };
    const request = vi
      .fn<PrimaryAiGateway["request"]>()
      .mockRejectedValueOnce(new Error("temporary provider failure"))
      .mockResolvedValueOnce(completed);

    await expect(
      requestPrimaryAiWithRetry({ request }, requestInput),
    ).resolves.toEqual({ result: completed, attemptCount: 2 });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("retries one explicit failed provider result", async () => {
    const failed = {
      status: "failed" as const,
      requestId: "request-1",
      errorCode: "provider_unavailable",
    };
    const completed = {
      status: "completed" as const,
      requestId: "request-2",
      reply: { body: "Done", evidence: [], contextualTargetObjectIds: [] },
      toolCalls: [],
    };
    const request = vi
      .fn<PrimaryAiGateway["request"]>()
      .mockResolvedValueOnce(failed)
      .mockResolvedValueOnce(completed);

    await expect(
      requestPrimaryAiWithRetry({ request }, requestInput),
    ).resolves.toEqual({ result: completed, attemptCount: 2 });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("does not repeat a completed or cancelled request", async () => {
    const cancelled = {
      status: "cancelled" as const,
      requestId: "request-1",
      errorCode: "cancelled",
    };
    const request = vi
      .fn<PrimaryAiGateway["request"]>()
      .mockResolvedValue(cancelled);

    await expect(
      requestPrimaryAiWithRetry({ request }, requestInput),
    ).resolves.toEqual({ result: cancelled, attemptCount: 1 });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("stops after the second provider failure", async () => {
    const request = vi
      .fn<PrimaryAiGateway["request"]>()
      .mockRejectedValue(new Error("provider unavailable"));

    await expect(
      requestPrimaryAiWithRetry({ request }, requestInput),
    ).rejects.toThrow("provider unavailable");
    expect(request).toHaveBeenCalledTimes(2);
  });
});
