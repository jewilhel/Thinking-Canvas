import type { AiToolCall } from "@/ai/collaborator-contract";
import type { ReviewObjectExplanation } from "@/ai/proposals";
import { stableAiToolCommandId } from "@/ai/trusted-execution";
import {
  reviewNewShapesArgumentsSchema,
  type ReviewNewShapesArguments,
} from "@/ai/tool-registry";
import type { ProductCanvasMutation } from "@/domain/canvas-command";

export function coalesceReviewNewShapeToolCalls(
  toolCalls: AiToolCall[],
): AiToolCall[] {
  const creationCalls = toolCalls.filter(
    (toolCall) => toolCall.toolName === "stage_new_shapes",
  );
  if (creationCalls.length <= 1) return toolCalls;

  const parsedCalls = creationCalls.map((toolCall) => ({
    callKey: toolCall.callKey,
    arguments: reviewNewShapesArgumentsSchema.parse(toolCall.arguments),
  }));
  const mergedArguments = reviewNewShapesArgumentsSchema.parse({
    summary: parsedCalls
      .map((item) => item.arguments.summary)
      .join(" ")
      .slice(0, 10_000),
    shapes: parsedCalls.flatMap((item, callIndex) =>
      item.arguments.shapes.map((shape) => ({
        ...shape,
        key: `${callIndex + 1}-${shape.key}`.slice(0, 120),
      })),
    ),
    explanations: parsedCalls.flatMap((item, callIndex) =>
      item.arguments.explanations.map((explanation) => ({
        ...explanation,
        key: `${callIndex + 1}-${explanation.key}`.slice(0, 120),
      })),
    ),
  });
  let inserted = false;
  return toolCalls.flatMap((toolCall) => {
    if (toolCall.toolName !== "stage_new_shapes") return [toolCall];
    if (inserted) return [];
    inserted = true;
    return [
      {
        callKey: parsedCalls[0]!.callKey,
        toolName: "stage_new_shapes",
        arguments: mergedArguments,
      },
    ];
  });
}

export async function materializeReviewNewShapes(input: {
  arguments: ReviewNewShapesArguments;
  runId: string;
  callKey: string;
  canvasId: string;
  actorId: string;
  issuedAt?: string;
}): Promise<{
  commands: ProductCanvasMutation[];
  explanations: ReviewObjectExplanation[];
}> {
  const toolArguments = reviewNewShapesArgumentsSchema.parse(input.arguments);
  const issuedAt = input.issuedAt ?? new Date().toISOString();
  const objectIds = new Map(
    await Promise.all(
      toolArguments.shapes.map(
        async (shape) =>
          [
            shape.key,
            await stableAiToolCommandId({
              runId: input.runId,
              callKey: `${input.callKey}\0new-shape:${shape.key}`,
            }),
          ] as const,
      ),
    ),
  );
  return {
    commands: toolArguments.shapes.flatMap((shape) => {
      const objectId = objectIds.get(shape.key)!;
      const createCommand = {
        type: "object.create" as const,
        payload: {
          object: {
            schemaVersion: 2 as const,
            id: objectId,
            canvasId: input.canvasId,
            createdBy: input.actorId,
            createdAt: issuedAt,
            updatedAt: issuedAt,
            type: "shape" as const,
            shape: shape.shape,
            text: shape.text,
            geometry: {
              x: shape.x,
              y: shape.y,
              width: shape.width,
              height: shape.height,
              rotation: 0,
            },
            style: {
              fill: shape.fill,
              outline: shape.outline,
              outlineWidth: shape.outlineWidth,
              fontFamily: shape.fontFamily,
              fontSize: shape.fontSize,
              fontWeight: shape.fontWeight,
              textAlign: shape.textAlign,
              listStyle: "none" as const,
              textColor: shape.textColor,
            },
          },
        },
      };
      return shape.layer === "back"
        ? [
            createCommand,
            {
              type: "object.reorder" as const,
              payload: { objectId, direction: "back" as const },
            },
          ]
        : [createCommand];
    }),
    explanations: toolArguments.explanations.map((explanation) => ({
      objectId: objectIds.get(explanation.key)!,
      whatChanged: explanation.whatChanged,
      why: explanation.why,
    })),
  };
}
