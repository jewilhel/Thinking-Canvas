import { describe, expect, it } from "vitest";

import {
  AI_PROJECTION_MAX_OBJECTS,
  buildAiCanvasProjection,
  ProjectionLimitError,
} from "@/ai/projection";
import type { CanvasObject } from "@/domain/canvas-object";

const canvasId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const now = "2026-08-11T16:00:00.000Z";

function makeObject(index: number, text = "A useful thought"): CanvasObject {
  return {
    schemaVersion: 1,
    id: `33333333-3333-4333-8333-${String(index).padStart(12, "0")}`,
    canvasId,
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
    type: "text",
    text,
    geometry: { x: index, y: 20, width: 240, height: 80, rotation: 0 },
  };
}

describe("buildAiCanvasProjection", () => {
  it("keeps only bounded, command-relevant object context", () => {
    const original = makeObject(1, "x".repeat(2_000));
    const projection = buildAiCanvasProjection({
      canvasId,
      objects: [original],
    });

    expect(projection.objects[0]).toEqual({
      id: original.id,
      type: "text",
      geometry: original.geometry,
      content: "x".repeat(500),
      relationships: [],
    });
    expect(JSON.stringify(projection)).not.toContain("createdBy");
    expect(JSON.stringify(projection)).not.toContain("createdAt");
  });

  it("rejects an oversized object selection before any model call", () => {
    const objects = Array.from(
      { length: AI_PROJECTION_MAX_OBJECTS + 1 },
      (_, index) => makeObject(index),
    );

    expect(() => buildAiCanvasProjection({ canvasId, objects })).toThrow(
      ProjectionLimitError,
    );
  });

  it("rejects a projection that exceeds the serialized byte budget", () => {
    const objects = Array.from({ length: 200 }, (_, index) =>
      makeObject(index, "🙂".repeat(500)),
    );

    expect(() => buildAiCanvasProjection({ canvasId, objects })).toThrow(
      ProjectionLimitError,
    );
  });
});
