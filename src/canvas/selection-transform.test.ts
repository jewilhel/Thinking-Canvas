import { describe, expect, it } from "vitest";

import type { CanvasObjectV2 } from "@/canvas/canvas-document";
import {
  rotateSelectionObjects,
  transformSelectionObjects,
} from "@/canvas/selection-transform";

const shared = {
  schemaVersion: 2 as const,
  canvasId: "11111111-1111-4111-8111-111111111111",
  createdBy: "22222222-2222-4222-8222-222222222222",
  createdAt: "2026-08-30T00:00:00.000Z",
  updatedAt: "2026-08-30T00:00:00.000Z",
  groupId: null,
  style: {
    fill: "#ffffff",
    outline: "#334155",
    outlineWidth: 2,
    fontFamily: "Inter, sans-serif",
    fontSize: 16,
  },
};

describe("combined selection transform", () => {
  it("maps object geometry and free connector endpoints into one target frame", () => {
    const objects: CanvasObjectV2[] = [
      {
        ...shared,
        id: "33333333-3333-4333-8333-333333333333",
        type: "shape",
        shape: "rectangle",
        text: "One",
        geometry: { x: 10, y: 20, width: 40, height: 30, rotation: 0 },
      },
      {
        ...shared,
        id: "44444444-4444-4444-8444-444444444444",
        type: "connector",
        start: { kind: "free", x: 20, y: 30 },
        end: { kind: "free", x: 80, y: 70 },
        geometry: { x: 0, y: 0, width: 24, height: 24, rotation: 0 },
      },
    ];

    const result = transformSelectionObjects(
      objects,
      { x: 10, y: 20, width: 70, height: 50 },
      { x: 100, y: 200, width: 140, height: 100 },
    );

    expect(result[0]?.geometry).toEqual({
      x: 100,
      y: 200,
      width: 80,
      height: 60,
      rotation: 0,
    });
    expect(result[1]).toMatchObject({
      start: { kind: "free", x: 120, y: 220 },
      end: { kind: "free", x: 240, y: 300 },
    });
  });

  it("preserves attached connector references", () => {
    const connector: CanvasObjectV2 = {
      ...shared,
      id: "44444444-4444-4444-8444-444444444444",
      type: "connector",
      start: {
        kind: "attached",
        objectId: "33333333-3333-4333-8333-333333333333",
        anchor: "right",
      },
      end: { kind: "free", x: 80, y: 70 },
      geometry: { x: 0, y: 0, width: 24, height: 24, rotation: 0 },
    };

    expect(
      transformSelectionObjects(
        [connector],
        { x: 10, y: 20, width: 70, height: 50 },
        { x: 100, y: 200, width: 140, height: 100 },
      )[0],
    ).toMatchObject({ start: connector.start });
  });

  it("rotates every group member around the frame center", () => {
    const first: CanvasObjectV2 = {
      ...shared,
      id: "33333333-3333-4333-8333-333333333333",
      type: "shape",
      shape: "rectangle",
      text: "One",
      geometry: { x: 0, y: 0, width: 20, height: 20, rotation: 0 },
    };
    const second: CanvasObjectV2 = {
      ...first,
      id: "44444444-4444-4444-8444-444444444444",
      geometry: { x: 80, y: 0, width: 20, height: 20, rotation: 0 },
    };
    const result = rotateSelectionObjects(
      [first, second],
      { x: 0, y: 0, width: 100, height: 20, rotation: 0 },
      90,
    );
    expect(result.map((object) => object.geometry)).toEqual([
      { x: 60, y: -40, width: 20, height: 20, rotation: 90 },
      { x: 60, y: 40, width: 20, height: 20, rotation: 90 },
    ]);
  });
});
