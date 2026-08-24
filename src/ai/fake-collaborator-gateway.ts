import {
  aiInvocationSchema,
  aiProjectionEnvelopeSchema,
  aiReplySchema,
  type AiInvocation,
  type AiProjectionEnvelope,
  type AiReply,
} from "@/ai/collaborator-contract";

export type FakeAiScenario = "complete" | "cancelled" | "failed";

export type FakeAiGatewayResult =
  | {
      status: "completed";
      requestId: string;
      reply: AiReply;
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
    scenario?: FakeAiScenario;
  }): Promise<FakeAiGatewayResult> {
    const invocation = aiInvocationSchema.parse(input.invocation);
    const projection = aiProjectionEnvelopeSchema.parse(input.projection);
    if (invocation.canvasId !== projection.canvasId) {
      throw new Error("The invocation and projection canvas must match.");
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
    const reply = aiReplySchema.parse({
      body:
        selectedPath.length > 1
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
    return { status: "completed", requestId, reply };
  }
}
