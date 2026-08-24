// @vitest-environment node

import { describe, expect, it } from "vitest";

import type { CanvasObjectV2 } from "@/canvas/canvas-document";
import { createMixedCanvasFixture } from "@/canvas/fixture";
import {
  canvasGridMetrics,
  canvasWheelIntent,
  connectionHandlePointV2,
  normalizeTransformedGeometry,
  pointWithinObjectHoverZone,
  previewGeometryDuringTransform,
  proportionalTextLayoutDuringResize,
  resolveConnectorPoints,
  resolveConnectorPointsV2,
  selectionAffordanceScale,
  zoomViewportAtPointer,
  zoomViewportAtPointerContinuously,
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

  it("uses a slower bounded curve for pointer-centered pinch zoom", () => {
    const pointer = { x: 320, y: 180 };
    const before = { x: 40, y: 20, scale: 1 };
    const worldBefore = {
      x: (pointer.x - before.x) / before.scale,
      y: (pointer.y - before.y) / before.scale,
    };
    const after = zoomViewportAtPointerContinuously(before, pointer, -20);

    expect(after.scale).toBeCloseTo(Math.exp(0.06));
    expect(after.scale).toBeLessThan(1.08);
    expect((pointer.x - after.x) / after.scale).toBeCloseTo(worldBefore.x);
    expect((pointer.y - after.y) / after.scale).toBeCloseTo(worldBefore.y);
  });

  it("anchors and scales the canvas grid with the viewport", () => {
    expect(canvasGridMetrics({ x: 50, y: -10, scale: 2 })).toEqual({
      spacing: 48,
      dotRadius: 2,
      x: 2,
      y: 38,
    });
    expect(canvasGridMetrics({ x: 80, y: 80, scale: 0.25 })).toEqual({
      spacing: 6,
      dotRadius: 0.5,
      x: 2,
      y: 2,
    });
  });

  it("shrinks selection affordances below 100% and hides them at overview zoom", () => {
    expect(selectionAffordanceScale(1.89)).toBe(1);
    expect(selectionAffordanceScale(1.02)).toBe(1);
    expect(selectionAffordanceScale(0.6)).toBe(0.6);
    expect(selectionAffordanceScale(0.45)).toBe(0.45);
    expect(selectionAffordanceScale(0.3)).toBe(0);
  });

  it("distinguishes trackpad panning from pinch and mouse-wheel zoom", () => {
    expect(
      canvasWheelIntent({
        ctrlKey: false,
        deltaMode: 0,
        deltaX: 24,
        deltaY: 16,
      }),
    ).toBe("pan");
    expect(
      canvasWheelIntent({
        ctrlKey: false,
        deltaMode: 0,
        deltaX: 0,
        deltaY: 72,
      }),
    ).toBe("pan");
    expect(
      canvasWheelIntent({
        ctrlKey: true,
        deltaMode: 0,
        deltaX: 0,
        deltaY: -20,
      }),
    ).toBe("zoom");
    expect(
      canvasWheelIntent({
        ctrlKey: false,
        deltaMode: 0,
        deltaX: 0,
        deltaY: -120,
      }),
    ).toBe("zoom");
  });

  it("normalizes Konva transform scale back into domain geometry", () => {
    const object = createMixedCanvasFixture(2)[0];
    if (!object) throw new Error("Fixture object is missing.");
    expect(normalizeTransformedGeometry(object, 2, 0.5)).toMatchObject({
      width: object.geometry.width * 2,
      height: object.geometry.height * 0.5,
    });
  });

  it("counter-scales live resize text while using the resized wrapping frame", () => {
    expect(
      proportionalTextLayoutDuringResize(
        { x: 12, y: 12, width: 96, height: 56 },
        1.5,
        0.5,
      ),
    ).toEqual({
      x: 8,
      y: 24,
      width: 96,
      height: 56,
      scaleX: 2 / 3,
      scaleY: 2,
    });
  });

  it("projects temporary transform geometry for live connector anchors", () => {
    expect(
      previewGeometryDuringTransform(
        { x: 100, y: 200, width: 180, height: 110, rotation: 0 },
        { x: 72, y: 184, scaleX: 0.5, scaleY: 1.5 },
      ),
    ).toEqual({
      x: 72,
      y: 184,
      width: 90,
      height: 165,
      rotation: 0,
    });
  });

  it("resolves attached connectors against temporary resize geometry", () => {
    const shared = {
      schemaVersion: 2 as const,
      canvasId: "20000000-0000-4000-8000-000000000001",
      createdBy: "10000000-0000-4000-8000-000000000001",
      createdAt: "2026-08-12T00:00:00.000Z",
      updatedAt: "2026-08-12T00:00:00.000Z",
      style: {
        fill: "#ffffff",
        outline: "#475569",
        outlineWidth: 2,
        fontFamily: "Inter",
        fontSize: 16,
      },
    };
    const start = {
      ...shared,
      id: "60000000-0000-4000-8000-000000000011",
      type: "shape" as const,
      shape: "rectangle" as const,
      text: "Start",
      geometry: { x: 100, y: 200, width: 180, height: 110, rotation: 0 },
    } satisfies CanvasObjectV2;
    const end = {
      ...shared,
      id: "60000000-0000-4000-8000-000000000012",
      type: "shape" as const,
      shape: "rectangle" as const,
      text: "End",
      geometry: { x: 500, y: 200, width: 180, height: 110, rotation: 0 },
    } satisfies CanvasObjectV2;
    const connector = {
      ...shared,
      id: "60000000-0000-4000-8000-000000000013",
      type: "connector" as const,
      start: {
        kind: "attached" as const,
        objectId: start.id,
        anchor: "right" as const,
      },
      end: {
        kind: "attached" as const,
        objectId: end.id,
        anchor: "left" as const,
      },
      geometry: { x: 280, y: 255, width: 220, height: 1, rotation: 0 },
    } satisfies CanvasObjectV2;
    const previewStart = {
      ...start,
      geometry: previewGeometryDuringTransform(start.geometry, {
        x: 100,
        y: 200,
        scaleX: 1.5,
        scaleY: 1,
      }),
    };
    const byId = new Map<string, CanvasObjectV2>([
      [previewStart.id, previewStart],
      [end.id, end],
      [connector.id, connector],
    ]);

    expect(resolveConnectorPointsV2(connector, byId)).toEqual([
      370, 255, 500, 255,
    ]);
  });

  it("places edge connection handles outside transform bounds and keeps center centered", () => {
    const object = {
      schemaVersion: 2 as const,
      id: "60000000-0000-4000-8000-000000000001",
      canvasId: "20000000-0000-4000-8000-000000000001",
      createdBy: "10000000-0000-4000-8000-000000000001",
      createdAt: "2026-08-12T00:00:00.000Z",
      updatedAt: "2026-08-12T00:00:00.000Z",
      type: "shape" as const,
      shape: "rectangle" as const,
      text: "Connection target",
      geometry: { x: 100, y: 200, width: 180, height: 110, rotation: 0 },
      style: {
        fill: "#ffffff",
        outline: "#475569",
        outlineWidth: 2,
        fontFamily: "Inter",
        fontSize: 16,
      },
    };

    expect(connectionHandlePointV2(object, "top", 18)).toEqual({
      x: 190,
      y: 182,
    });
    expect(connectionHandlePointV2(object, "right", 18)).toEqual({
      x: 298,
      y: 255,
    });
    expect(connectionHandlePointV2(object, "center", 18)).toEqual({
      x: 190,
      y: 255,
    });
  });

  it("keeps connection anchors available while the pointer crosses the exterior gap", () => {
    const object = {
      schemaVersion: 2,
      id: "60000000-0000-4000-8000-000000000002",
      canvasId: "20000000-0000-4000-8000-000000000001",
      createdBy: "10000000-0000-4000-8000-000000000001",
      createdAt: "2026-08-12T00:00:00.000Z",
      updatedAt: "2026-08-12T00:00:00.000Z",
      type: "shape",
      shape: "rectangle",
      text: "Hover target",
      geometry: { x: 100, y: 200, width: 180, height: 110, rotation: 0 },
      style: {
        fill: "#ffffff",
        outline: "#475569",
        outlineWidth: 2,
        fontFamily: "Inter",
        fontSize: 16,
      },
    } satisfies CanvasObjectV2;
    const { x, y, width, height } = object.geometry;

    expect(
      pointWithinObjectHoverZone(
        object,
        { x: x + width + 32, y: y + height / 2 },
        44,
      ),
    ).toBe(true);
    expect(
      pointWithinObjectHoverZone(
        object,
        { x: x + width + 45, y: y + height / 2 },
        44,
      ),
    ).toBe(false);
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
