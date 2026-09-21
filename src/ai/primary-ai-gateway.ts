import { providerRetryDelay } from "@/ai/provider-failure";
import { throwIfAiRunAborted } from "@/ai/run-deadline";

import type {
  AiInvocation,
  AiProjectionEnvelope,
  AiReply,
  AiToolCall,
} from "@/ai/collaborator-contract";
import type { AiToolName } from "@/ai/tool-registry";

export class AiProviderOutputError extends Error {
  constructor() {
    super("The AI provider returned an invalid structured response.");
    this.name = "AiProviderOutputError";
  }
}

export class AiProviderTimeoutError extends Error {
  constructor() {
    super("The AI provider request timed out.");
    this.name = "AiProviderTimeoutError";
  }
}

export type FakeAiScenario = "complete" | "cancelled" | "failed";

export type PrimaryAiGatewayResult =
  | {
      status: "completed";
      requestId: string;
      reply: AiReply;
      toolCalls: AiToolCall[];
      telemetry?: {
        model: string;
        latencyMs: number;
        inputTokens: number;
        outputTokens: number;
      };
    }
  | {
      status: "cancelled" | "failed";
      requestId: string;
      errorCode: string;
    };

export interface PrimaryAiGateway {
  request(input: {
    invocation: AiInvocation;
    projection: AiProjectionEnvelope;
    allowedToolNames: AiToolName[];
    scenario?: FakeAiScenario;
    signal?: AbortSignal;
  }): Promise<PrimaryAiGatewayResult>;
  reviewVisualChange?(input: {
    instruction: string;
    targetObjectIds: string[];
    beforeImageDataUrl: string;
    afterImageDataUrl: string;
    beforeOverviewImageDataUrl?: string;
    afterOverviewImageDataUrl?: string;
    proposedCommands: unknown[];
    proposedObjectStates: unknown[];
    signal?: AbortSignal;
  }): Promise<{
    status: "pass" | "refine" | "fail";
    issueCount: number;
    replacementCommands?: unknown[];
    requestId: string;
    model: string;
  }>;
}

export const AI_PROVIDER_ATTEMPT_LIMIT = 2;

export async function requestPrimaryAiWithRetry(
  gateway: PrimaryAiGateway,
  input: Parameters<PrimaryAiGateway["request"]>[0],
  attemptLimit = AI_PROVIDER_ATTEMPT_LIMIT,
) {
  let result: PrimaryAiGatewayResult | null = null;
  let lastError: unknown;

  for (let attemptCount = 1; attemptCount <= attemptLimit; attemptCount += 1) {
    throwIfAiRunAborted(input.signal);
    let retryError: unknown;
    try {
      result = await gateway.request(input);
      if (result.status !== "failed" || attemptCount === attemptLimit) {
        return { result, attemptCount };
      }
    } catch (error) {
      if (input.signal?.aborted || attemptCount === attemptLimit) {
        throw error;
      }
      lastError = error;
      retryError = error;
    }
    const delay = providerRetryDelay(retryError, attemptCount);
    if (delay === null) throw retryError;
    await waitForProviderRetry(delay, input.signal);
  }

  if (lastError) throw lastError;
  if (!result) throw new Error("The AI provider did not return a result.");
  return { result, attemptCount: attemptLimit };
}

function waitForProviderRetry(delay: number, signal?: AbortSignal) {
  throwIfAiRunAborted(signal);
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(signal?.reason ?? new DOMException("Interrupted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, delay);
    signal?.addEventListener("abort", abort, { once: true });
  });
}
