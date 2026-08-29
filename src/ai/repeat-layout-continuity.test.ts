import { describe, expect, it } from "vitest";

import {
  buildRepeatedLayoutResult,
  isRepeatedStraightenAndSpaceRequest,
} from "@/ai/repeat-layout-continuity";
import { canvasObjectV2Schema } from "@/canvas/canvas-document";

const canvasId = "20000000-0000-4000-8000-000000000001";
const actorId = "10000000-0000-4000-8000-000000000001";

function shape(id: string, x: number, y: number) {
  return canvasObjectV2Schema.parse({
    schemaVersion: 2,
    id,
    canvasId,
    createdBy: actorId,
    createdAt: "2026-08-28T12:00:00.000Z",
    updatedAt: "2026-08-28T12:00:00.000Z",
    type: "shape",
    shape: "rectangle",
    text: "Roadmap card",
    geometry: { x, y, width: 100, height: 60, rotation: 0 },
    style: {
      fill: "#ffffff",
      outline: "#18181b",
      outlineWidth: 2,
      fontFamily: "Inter",
      fontSize: 16,
      textColor: "#18181b",
    },
  });
}

describe("repeat layout continuity", () => {
  it("recognizes the same request despite punctuation differences", () => {
    expect(
      isRepeatedStraightenAndSpaceRequest({
        instruction: "Straighten these up and give them even breathing room",
        sourceInstruction:
          "Straighten these up and give them even breathing room.”",
      }),
    ).toBe(true);
  });

  it("builds one provider-free compound layout action", () => {
    const result = buildRepeatedLayoutResult({
      runId: "70000000-0000-4000-8000-000000000001",
      objects: [
        shape("61000000-0000-4000-8000-000000000001", 0, 0),
        shape("61000000-0000-4000-8000-000000000002", 300, 50),
      ],
    });
    expect(result?.status).toBe("completed");
    if (result?.status !== "completed") throw new Error("Expected result");
    expect(result.telemetry?.model).toBe("deterministic-layout-continuity");
    expect(result.toolCalls[0]).toMatchObject({
      toolName: "stage_layout_changes",
      arguments: {
        layout: {
          operation: "align_and_space",
          axis: "horizontal",
        },
      },
    });
  });
});
