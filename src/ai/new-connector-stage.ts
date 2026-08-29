import type { ReviewObjectExplanation } from "@/ai/proposals";
import { stableAiToolCommandId } from "@/ai/trusted-execution";
import {
  reviewNewConnectorsArgumentsSchema,
  type ReviewNewConnectorsArguments,
} from "@/ai/tool-registry";
import type { CanvasObjectV2 } from "@/canvas/canvas-document";
import type { ProductCanvasMutation } from "@/domain/canvas-command";

function connectorAnchors(from: CanvasObjectV2, to: CanvasObjectV2) {
  const fromCenter = {
    x: from.geometry.x + from.geometry.width / 2,
    y: from.geometry.y + from.geometry.height / 2,
  };
  const toCenter = {
    x: to.geometry.x + to.geometry.width / 2,
    y: to.geometry.y + to.geometry.height / 2,
  };
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? ({ start: "right", end: "left" } as const)
      : ({ start: "left", end: "right" } as const);
  }
  return dy >= 0
    ? ({ start: "bottom", end: "top" } as const)
    : ({ start: "top", end: "bottom" } as const);
}

export async function materializeReviewNewConnectors(input: {
  arguments: ReviewNewConnectorsArguments;
  sourceObjects: CanvasObjectV2[];
  runId: string;
  callKey: string;
  canvasId: string;
  actorId: string;
  issuedAt?: string;
}): Promise<{
  commands: ProductCanvasMutation[];
  explanations: ReviewObjectExplanation[];
}> {
  const toolArguments = reviewNewConnectorsArgumentsSchema.parse(
    input.arguments,
  );
  const issuedAt = input.issuedAt ?? new Date().toISOString();
  const sourceById = new Map(
    input.sourceObjects.map((object) => [object.id, object]),
  );
  const connectorIds = new Map(
    await Promise.all(
      toolArguments.connectors.map(
        async (connector) =>
          [
            connector.key,
            await stableAiToolCommandId({
              runId: input.runId,
              callKey: `${input.callKey}\0new-connector:${connector.key}`,
            }),
          ] as const,
      ),
    ),
  );
  const commands = toolArguments.connectors.map((connector) => {
    const from = sourceById.get(connector.fromObjectId);
    const to = sourceById.get(connector.toObjectId);
    if (
      !from ||
      !to ||
      from.type !== "shape" ||
      to.type !== "shape" ||
      from.id === to.id
    ) {
      throw new Error(
        "New connectors require two distinct existing shape objects.",
      );
    }
    const anchors = connectorAnchors(from, to);
    return {
      type: "object.create" as const,
      payload: {
        object: {
          schemaVersion: 2 as const,
          id: connectorIds.get(connector.key)!,
          canvasId: input.canvasId,
          createdBy: input.actorId,
          createdAt: issuedAt,
          updatedAt: issuedAt,
          type: "connector" as const,
          start: {
            kind: "attached" as const,
            objectId: from.id,
            anchor: anchors.start,
          },
          end: {
            kind: "attached" as const,
            objectId: to.id,
            anchor: anchors.end,
          },
          geometry: { x: 0, y: 0, width: 24, height: 24, rotation: 0 },
          style: {
            fill: null,
            outline: connector.outline,
            outlineWidth: connector.outlineWidth,
            fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
            fontSize: 16,
            fontWeight: "normal" as const,
            textAlign: "left" as const,
            listStyle: "none" as const,
            linkUrl: null,
            textColor: "#18181b",
          },
        },
      },
    } satisfies ProductCanvasMutation;
  });
  return {
    commands,
    explanations: toolArguments.explanations.map((explanation) => ({
      objectId: connectorIds.get(explanation.key)!,
      whatChanged: explanation.whatChanged,
      why: explanation.why,
    })),
  };
}
