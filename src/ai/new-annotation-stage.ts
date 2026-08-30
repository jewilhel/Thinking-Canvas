import { canonicalizeAnnotationSamples } from "@/canvas/annotation-stroke";
import type { ReviewObjectExplanation } from "@/ai/proposals";
import { stableAiToolCommandId } from "@/ai/trusted-execution";
import {
  reviewNewAnnotationsArgumentsSchema,
  type ReviewNewAnnotationsArguments,
} from "@/ai/tool-registry";
import type { ProductCanvasMutation } from "@/domain/canvas-command";

export async function materializeReviewNewAnnotations(input: {
  arguments: ReviewNewAnnotationsArguments;
  runId: string;
  callKey: string;
  canvasId: string;
  actorId: string;
  issuedAt?: string;
}): Promise<{
  commands: ProductCanvasMutation[];
  explanations: ReviewObjectExplanation[];
}> {
  const toolArguments = reviewNewAnnotationsArgumentsSchema.parse(
    input.arguments,
  );
  const issuedAt = input.issuedAt ?? new Date().toISOString();
  const objectIds = new Map(
    await Promise.all(
      toolArguments.annotations.map(
        async (annotation) =>
          [
            annotation.key,
            await stableAiToolCommandId({
              runId: input.runId,
              callKey: `${input.callKey}\0new-annotation:${annotation.key}`,
            }),
          ] as const,
      ),
    ),
  );
  const commands = toolArguments.annotations.map(
    (annotation): ProductCanvasMutation => {
      const canonical = canonicalizeAnnotationSamples(
        annotation.points,
        annotation.outlineWidth,
      );
      if (!canonical) {
        throw new Error("A new annotation path must contain visible movement.");
      }
      return {
        type: "object.create",
        payload: {
          object: {
            schemaVersion: 2,
            id: objectIds.get(annotation.key)!,
            canvasId: input.canvasId,
            createdBy: input.actorId,
            createdAt: issuedAt,
            updatedAt: issuedAt,
            groupId: null,
            type: "annotation",
            strokeVersion: 1,
            pointerType: "mouse",
            points: canonical.points,
            pressures: canonical.pressures,
            baseWidth: canonical.geometry.width,
            baseHeight: canonical.geometry.height,
            temporary: true,
            attachedObjectId: null,
            attachmentOffset: null,
            geometry: canonical.geometry,
            style: {
              fill: null,
              outline: annotation.outline,
              outlineWidth: annotation.outlineWidth,
              fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
              fontSize: 16,
              fontWeight: "normal",
              textAlign: "left",
              listStyle: "none",
              linkUrl: null,
              textColor: "#18181b",
            },
          },
        },
      };
    },
  );
  return {
    commands,
    explanations: toolArguments.explanations.map((explanation) => ({
      objectId: objectIds.get(explanation.key)!,
      whatChanged: explanation.whatChanged,
      why: explanation.why,
    })),
  };
}
