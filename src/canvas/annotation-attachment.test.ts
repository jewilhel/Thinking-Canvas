import { describe, expect, it } from "vitest";

import { findAnnotationAttachmentTarget } from "@/canvas/annotation-attachment";
import type { CanvasObjectV2 } from "@/canvas/canvas-document";

const canvasId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const now = "2026-08-30T00:00:00.000Z";
const style = {
  fill: "#ffffff",
  outline: "#334155",
  outlineWidth: 2,
  fontFamily: "Inter, sans-serif",
  fontSize: 16,
};

function shape(
  id: string,
  kind: "rectangle" | "ellipse" | "diamond",
): CanvasObjectV2 {
  return {
    schemaVersion: 2,
    id,
    canvasId,
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
    groupId: null,
    type: "shape",
    shape: kind,
    text: kind,
    geometry: { x: 100, y: 100, width: 120, height: 80, rotation: 0 },
    style,
  };
}

function annotation(
  x = 90,
  y = 130,
): Extract<CanvasObjectV2, { type: "annotation" }> {
  return {
    schemaVersion: 2,
    id: "33333333-3333-4333-8333-333333333333",
    canvasId,
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
    groupId: null,
    type: "annotation",
    strokeVersion: 1,
    pointerType: "pen",
    points: [0, 0, 70, 0, 140, 0],
    pressures: [0.5, 0.5, 0.5],
    baseWidth: 140,
    baseHeight: 1,
    temporary: true,
    attachedObjectId: null,
    geometry: { x, y, width: 140, height: 1, rotation: 0 },
    style: { ...style, fill: null, outlineWidth: 5 },
  };
}

describe("annotation attachment target lookup", () => {
  it.each(["rectangle", "ellipse", "diamond"] as const)(
    "refines an rbush candidate against %s geometry",
    (kind) => {
      const target = shape(
        kind === "rectangle"
          ? "44444444-4444-4444-8444-444444444444"
          : kind === "ellipse"
            ? "55555555-5555-4555-8555-555555555555"
            : "66666666-6666-4666-8666-666666666666",
        kind,
      );
      expect(findAnnotationAttachmentTarget(annotation(), [target])).toEqual(
        target,
      );
    },
  );

  it("selects the topmost eligible overlap and excludes ineligible objects", () => {
    const lower = shape("44444444-4444-4444-8444-444444444444", "rectangle");
    const upper: CanvasObjectV2 = {
      ...shape("55555555-5555-4555-8555-555555555555", "rectangle"),
      type: "table",
      cells: [["top"]],
    };
    const connector: CanvasObjectV2 = {
      ...shape("66666666-6666-4666-8666-666666666666", "rectangle"),
      type: "connector",
      start: { kind: "free", x: 90, y: 130 },
      end: { kind: "free", x: 230, y: 130 },
      style: { ...style, fill: null },
    };
    expect(
      findAnnotationAttachmentTarget(annotation(), [lower, connector, upper]),
    ).toEqual(upper);
  });

  it("rejects a near miss after the bounding-box candidate search", () => {
    const ellipse = shape("55555555-5555-4555-8555-555555555555", "ellipse");
    expect(
      findAnnotationAttachmentTarget(annotation(95, 96), [ellipse]),
    ).toBeNull();
  });
});
