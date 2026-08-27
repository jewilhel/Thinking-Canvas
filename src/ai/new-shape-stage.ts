import type { ReviewObjectExplanation } from "@/ai/proposals";
import { stableAiToolCommandId } from "@/ai/trusted-execution";
import {
  reviewNewShapesArgumentsSchema,
  type ReviewNewShapesArguments,
} from "@/ai/tool-registry";
import type { ProductCanvasMutation } from "@/domain/canvas-command";

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
    commands: toolArguments.shapes.map((shape) => ({
      type: "object.create",
      payload: {
        object: {
          schemaVersion: 2,
          id: objectIds.get(shape.key)!,
          canvasId: input.canvasId,
          createdBy: input.actorId,
          createdAt: issuedAt,
          updatedAt: issuedAt,
          type: "shape",
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
            listStyle: "none",
            textColor: shape.textColor,
          },
        },
      },
    })),
    explanations: toolArguments.explanations.map((explanation) => ({
      objectId: objectIds.get(explanation.key)!,
      whatChanged: explanation.whatChanged,
      why: explanation.why,
    })),
  };
}
