import type { CanvasObjectV2 } from "@/canvas/canvas-document";
import type { PrimaryAiGatewayResult } from "@/ai/primary-ai-gateway";

function normalizeInstruction(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isRepeatedStraightenAndSpaceRequest(input: {
  instruction: string;
  sourceInstruction: string;
}) {
  const instruction = normalizeInstruction(input.instruction);
  const sourceInstruction = normalizeInstruction(input.sourceInstruction);
  return (
    instruction === sourceInstruction &&
    instruction.includes("straighten") &&
    (instruction.includes("breathing room") ||
      instruction.includes("even spacing"))
  );
}

export function buildRepeatedLayoutResult(input: {
  runId: string;
  objects: CanvasObjectV2[];
}): PrimaryAiGatewayResult | null {
  if (input.objects.length < 2) return null;
  const xCenters = input.objects.map(
    (object) => object.geometry.x + object.geometry.width / 2,
  );
  const yCenters = input.objects.map(
    (object) => object.geometry.y + object.geometry.height / 2,
  );
  const xSpan = Math.max(...xCenters) - Math.min(...xCenters);
  const ySpan = Math.max(...yCenters) - Math.min(...yCenters);
  const axis = xSpan >= ySpan ? "horizontal" : "vertical";
  const label = (object: CanvasObjectV2) =>
    object.type === "shape" || object.type === "text"
      ? object.text || object.type
      : object.type === "document"
        ? object.title
        : object.type;

  return {
    status: "completed",
    requestId: `deterministic-repeat-${input.runId}`,
    reply: {
      body: "I straightened the same objects and restored even spacing.",
      evidence: input.objects.map((object) => ({
        objectId: object.id,
        label: label(object),
      })),
      contextualTargetObjectIds: input.objects.map((object) => object.id),
    },
    toolCalls: [
      {
        callKey: "repeat-align-and-space",
        toolName: "stage_layout_changes",
        arguments: {
          summary: "Straighten the same objects with even spacing.",
          layout: {
            operation: "align_and_space",
            objectIds: input.objects.map((object) => object.id),
            axis,
          },
          explanations: input.objects.map((object) => ({
            objectId: object.id,
            whatChanged: "Aligned and evenly spaced this object.",
            why: "This repeats the requested layout after the prior change was undone.",
          })),
        },
      },
    ],
    telemetry: {
      model: "deterministic-layout-continuity",
      latencyMs: 0,
      inputTokens: 0,
      outputTokens: 0,
    },
  };
}
