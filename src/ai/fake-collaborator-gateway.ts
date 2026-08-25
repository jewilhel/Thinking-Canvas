import {
  aiInvocationSchema,
  aiProjectionEnvelopeSchema,
  aiReplySchema,
  type AiInvocation,
  type AiProjectionEnvelope,
  type AiReply,
  type AiToolCall,
} from "@/ai/collaborator-contract";
import { allowedAiToolNames, type AiToolName } from "@/ai/tool-registry";

export type FakeAiScenario = "complete" | "cancelled" | "failed";

export type FakeAiGatewayResult =
  | {
      status: "completed";
      requestId: string;
      reply: AiReply;
      toolCalls: AiToolCall[];
    }
  | {
      status: "cancelled" | "failed";
      requestId: string;
      errorCode: "cancelled_by_user" | "fake_provider_failure";
    };

export class FakePrimaryAiGateway {
  async request(input: {
    invocation: AiInvocation;
    projection: AiProjectionEnvelope;
    allowedToolNames: AiToolName[];
    scenario?: FakeAiScenario;
  }): Promise<FakeAiGatewayResult> {
    const invocation = aiInvocationSchema.parse(input.invocation);
    const projection = aiProjectionEnvelopeSchema.parse(input.projection);
    if (invocation.canvasId !== projection.canvasId) {
      throw new Error("The invocation and projection canvas must match.");
    }
    const expectedTools = allowedAiToolNames(invocation.authority);
    if (
      input.allowedToolNames.length !== expectedTools.length ||
      input.allowedToolNames.some(
        (name, index) => name !== expectedTools[index],
      )
    ) {
      throw new Error(
        "The AI tool allowlist does not match current authority.",
      );
    }

    const requestId = `fake-${invocation.runId}`;
    if (input.scenario === "cancelled") {
      return { status: "cancelled", requestId, errorCode: "cancelled_by_user" };
    }
    if (input.scenario === "failed") {
      return {
        status: "failed",
        requestId,
        errorCode: "fake_provider_failure",
      };
    }

    const objectsById = new Map(
      projection.objects.map((object) => [object.id, object]),
    );
    const selectedPath = invocation.selectedPathIds.flatMap((id) => {
      const object = objectsById.get(id);
      return object ? [object] : [];
    });
    const firstObject = selectedPath[0] ?? projection.objects[0];
    const sourceThread = projection.commentThreads.find(
      (thread) => thread.id === invocation.commentId,
    );
    const shouldCreateContextualComment =
      invocation.instruction.toLowerCase().includes("contextual comment") &&
      firstObject !== undefined &&
      sourceThread?.targetObjectIds.length === 0;
    const shouldProposeChanges =
      invocation.instruction.toLowerCase().includes("propose") &&
      firstObject !== undefined &&
      input.allowedToolNames.includes("propose_canvas_commands");
    const reply = aiReplySchema.parse({
      body: shouldProposeChanges
        ? "I prepared a validated proposal without changing the canvas."
        : selectedPath.length > 1
          ? `I inspected ${selectedPath.length} selected path objects in order: ${selectedPath.map((object) => object.summary || object.type).join(" → ")}.`
          : `I inspected ${projection.objects.length} canvas objects and ${projection.commentThreads.length} comment conversations.`,
      evidence: firstObject
        ? [
            {
              objectId: firstObject.id,
              label: firstObject.summary || firstObject.type,
            },
          ]
        : [],
      contextualTargetObjectIds: firstObject ? [firstObject.id] : [],
    });
    const toolCalls = shouldProposeChanges
      ? [
          {
            callKey: "proposal-1",
            toolName: "propose_canvas_commands",
            arguments: {
              commands: [
                {
                  type: "object.move",
                  payload: {
                    objectId: firstObject.id,
                    x: firstObject.geometry.x + 40,
                    y: firstObject.geometry.y,
                  },
                },
              ],
            },
          },
        ]
      : shouldCreateContextualComment
        ? [
            {
              callKey: "contextual-comment-1",
              toolName: "create_contextual_comment",
              arguments: {
                body: `Grounded observation: ${firstObject.summary || firstObject.type} is a concrete evidence point for this canvas.`,
                targetObjectIds: [firstObject.id],
              },
            },
          ]
        : [];
    return { status: "completed", requestId, reply, toolCalls };
  }
}
