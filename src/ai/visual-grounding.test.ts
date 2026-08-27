import { describe, expect, it } from "vitest";

import {
  assertNoNewDeterministicVisualDefects,
  buildObjectVisualFacts,
  estimateTextLayout,
  rotatedObjectBounds,
} from "@/ai/visual-grounding";
import {
  canvasObjectV2Schema,
  type CanvasObjectV2,
} from "@/canvas/canvas-document";

const canvasId = "20000000-0000-4000-8000-000000000001";
const actorId = "10000000-0000-4000-8000-000000000001";

function shape(
  id: string,
  geometry: CanvasObjectV2["geometry"],
  text = "Idea",
) {
  return canvasObjectV2Schema.parse({
    schemaVersion: 2,
    id,
    canvasId,
    createdBy: actorId,
    createdAt: "2026-08-26T12:00:00.000Z",
    updatedAt: "2026-08-26T12:00:00.000Z",
    type: "shape",
    shape: "rectangle",
    text,
    geometry,
    style: {
      fill: "#ffffff",
      outline: "#18181b",
      outlineWidth: 2,
      fontFamily: "Inter",
      fontSize: 16,
      fontWeight: "normal",
      textAlign: "center",
      listStyle: "none",
      linkUrl: null,
      textColor: "#18181b",
    },
  });
}

describe("AI visual grounding", () => {
  it("computes rotated bounds without replacing authoritative geometry", () => {
    const object = shape("61000000-0000-4000-8000-000000000001", {
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      rotation: 90,
    });
    expect(rotatedObjectBounds(object)).toEqual({
      x: 35,
      y: -5,
      width: 50.00000000000001,
      height: 100,
    });
    expect(object.geometry).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      rotation: 90,
    });
  });

  it("reports estimated clipping and deterministic overlaps", () => {
    const first = shape(
      "61000000-0000-4000-8000-000000000001",
      { x: 0, y: 0, width: 80, height: 30, rotation: 0 },
      "A deliberately long label that needs several lines",
    );
    const second = shape("61000000-0000-4000-8000-000000000002", {
      x: 60,
      y: 10,
      width: 80,
      height: 40,
      rotation: 0,
    });
    expect(estimateTextLayout(first).estimatedTextClipped).toBe(true);
    expect(buildObjectVisualFacts(first, [first, second])).toMatchObject({
      estimatedTextClipped: true,
      overlappingObjectIds: [second.id],
    });
  });

  it("blocks newly introduced deterministic visual defects", () => {
    const targetId = "61000000-0000-4000-8000-000000000001";
    const neighbor = shape("61000000-0000-4000-8000-000000000002", {
      x: 240,
      y: 0,
      width: 120,
      height: 80,
      rotation: 0,
    });
    const before = shape(targetId, {
      x: 0,
      y: 0,
      width: 120,
      height: 80,
      rotation: 0,
    });
    const after = shape(targetId, {
      x: 180,
      y: 0,
      width: 120,
      height: 80,
      rotation: 0,
    });
    expect(() =>
      assertNoNewDeterministicVisualDefects({
        beforeObjects: [before, neighbor],
        afterObjects: [after, neighbor],
        targetObjectIds: [targetId],
      }),
    ).toThrow("overlap");
    expect(() =>
      assertNoNewDeterministicVisualDefects({
        beforeObjects: [before, neighbor],
        afterObjects: [before, neighbor],
        targetObjectIds: [targetId],
      }),
    ).not.toThrow();
  });
});
