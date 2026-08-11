// @vitest-environment node

import { describe, expect, it } from "vitest";

import { createMixedCanvasFixture } from "@/canvas/fixture";
import {
  normalizeTransformedGeometry,
  resolveConnectorPoints,
  zoomViewportAtPointer,
} from "@/canvas/geometry";

describe("canvas geometry", () => {
  it("keeps the world point under the pointer while zooming", () => {
    const pointer = { x: 320, y: 180 };
    const before = { x: 40, y: 20, scale: 1 };
    const worldBefore = {
      x: (pointer.x - before.x) / before.scale,
      y: (pointer.y - before.y) / before.scale,
    };
    const after = zoomViewportAtPointer(before, pointer, -1);

    expect((pointer.x - after.x) / after.scale).toBeCloseTo(worldBefore.x);
    expect((pointer.y - after.y) / after.scale).toBeCloseTo(worldBefore.y);
  });

  it("normalizes Konva transform scale back into domain geometry", () => {
    const object = createMixedCanvasFixture(2)[0];
    if (!object) throw new Error("Fixture object is missing.");
    expect(normalizeTransformedGeometry(object, 2, 0.5)).toMatchObject({
      width: object.geometry.width * 2,
      height: object.geometry.height * 0.5,
    });
  });

  it("derives attached connector endpoints from current object geometry", () => {
    const fixture = createMixedCanvasFixture(10);
    const connector = fixture.find((object) => object.type === "connector");
    if (!connector || connector.type !== "connector")
      throw new Error("Connector missing.");
    const byId = new Map(fixture.map((object) => [object.id, object]));
    const before = resolveConnectorPoints(connector, byId);
    const start = byId.get(connector.startObjectId ?? "");
    if (!start) throw new Error("Start object missing.");
    byId.set(start.id, {
      ...start,
      geometry: { ...start.geometry, x: start.geometry.x + 90 },
    });

    expect(resolveConnectorPoints(connector, byId)).not.toEqual(before);
  });
});
