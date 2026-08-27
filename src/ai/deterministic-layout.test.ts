import { describe, expect, it } from "vitest";

import {
  DeterministicLayoutError,
  planDeterministicLayout,
} from "@/ai/deterministic-layout";
import { canvasObjectV2Schema } from "@/canvas/canvas-document";

const canvasId = "20000000-0000-4000-8000-000000000001";
const actorId = "10000000-0000-4000-8000-000000000001";

function shape(id: string, x: number, y: number, text = "Idea") {
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

const ids = [
  "61000000-0000-4000-8000-000000000001",
  "61000000-0000-4000-8000-000000000002",
  "61000000-0000-4000-8000-000000000003",
] as const;

describe("deterministic AI layout tools", () => {
  it("aligns targets using server-computed coordinates", () => {
    const objects = [shape(ids[0], 20, 10), shape(ids[1], 80, 100)];
    expect(
      planDeterministicLayout({
        objects,
        request: {
          operation: "align",
          objectIds: ids.slice(0, 2),
          alignment: "left",
        },
      }),
    ).toEqual([
      {
        type: "object.move",
        payload: { objectId: ids[1], x: 20, y: 100 },
      },
    ]);
  });

  it("normalizes spacing in stable geometric order", () => {
    const objects = [
      shape(ids[2], 500, 0),
      shape(ids[0], 0, 0),
      shape(ids[1], 250, 0),
    ];
    expect(
      planDeterministicLayout({
        objects,
        request: {
          operation: "normalize_spacing",
          objectIds: [...ids],
          axis: "horizontal",
          spacing: 24,
        },
      }),
    ).toEqual([
      {
        type: "object.move",
        payload: { objectId: ids[1], x: 124, y: 0 },
      },
      {
        type: "object.move",
        payload: { objectId: ids[2], x: 248, y: 0 },
      },
    ]);
  });

  it("rejects missing targets instead of inventing geometry", () => {
    expect(() =>
      planDeterministicLayout({
        objects: [shape(ids[0], 0, 0)],
        request: {
          operation: "align",
          objectIds: [ids[0], ids[1]],
          alignment: "top",
        },
      }),
    ).toThrowError(DeterministicLayoutError);
  });
});
