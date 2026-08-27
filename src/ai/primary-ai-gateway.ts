import type {
  AiInvocation,
  AiProjectionEnvelope,
  AiReply,
  AiToolCall,
} from "@/ai/collaborator-contract";
import type { AiToolName } from "@/ai/tool-registry";

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
