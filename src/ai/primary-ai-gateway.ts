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
) {
  let result: PrimaryAiGatewayResult | null = null;
  let lastError: unknown;

  for (
    let attemptCount = 1;
    attemptCount <= AI_PROVIDER_ATTEMPT_LIMIT;
    attemptCount += 1
  ) {
    try {
      result = await gateway.request(input);
      if (
        result.status !== "failed" ||
        attemptCount === AI_PROVIDER_ATTEMPT_LIMIT
      ) {
        return { result, attemptCount };
      }
    } catch (error) {
      if (input.signal?.aborted || attemptCount === AI_PROVIDER_ATTEMPT_LIMIT) {
        throw error;
      }
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  if (!result) throw new Error("The AI provider did not return a result.");
  return { result, attemptCount: AI_PROVIDER_ATTEMPT_LIMIT };
}
