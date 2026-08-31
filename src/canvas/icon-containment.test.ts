import { describe, expect, it } from "vitest";

import type { CanvasObjectV2 } from "@/canvas/canvas-document";
import {
  childWorldGeometry,
  clampIconGeometryToParent,
  fullyContains,
  parentRelativeGeometry,
} from "@/canvas/icon-containment";

const shared = {
  schemaVersion: 2 as const,
  canvasId: "11111111-1111-4111-8111-111111111111",
  createdBy: "22222222-2222-4222-8222-222222222222",
  createdAt: "2026-08-30T00:00:00.000Z",
  updatedAt: "2026-08-30T00:00:00.000Z",
  style: {
    fill: "#ffffff",
    outline: "#334155",
    outlineWidth: 2,
    fontFamily: "Inter",
    fontSize: 16,
  },
};

const parent: Extract<CanvasObjectV2, { type: "shape" }> = {
  ...shared,
  id: "33333333-3333-4333-8333-333333333333",
  type: "shape",
  shape: "rectangle",
  text: "Parent",
  geometry: { x: 100, y: 200, width: 400, height: 200, rotation: 0 },
};

const child: Extract<CanvasObjectV2, { type: "icon" }> = {
  ...shared,
  id: "44444444-4444-4444-8444-444444444444",
  type: "icon",
  catalog: "phosphor",
  catalogVersion: "2.1.1",
  iconName: "brain",
  iconVariant: "fill",
  parentId: parent.id,
  parentRelative: { x: 0.25, y: 0.25, width: 0.25, height: 0.5 },
  geometry: { x: 200, y: 250, width: 100, height: 100, rotation: 0 },
};

describe("icon containment geometry", () => {
  it("round-trips world and normalized parent geometry", () => {
    expect(parentRelativeGeometry(child.geometry, parent)).toEqual(
      child.parentRelative,
    );
    expect(childWorldGeometry(child, parent)).toEqual(child.geometry);
  });

  it("moves and scales a child proportionally with its parent", () => {
    const resizedParent = {
      ...parent,
      geometry: { ...parent.geometry, x: 300, width: 800, height: 400 },
    };
    expect(childWorldGeometry(child, resizedParent)).toMatchObject({
      x: 500,
      y: 300,
      width: 200,
      height: 200,
    });
  });

  it("clamps independently edited children inside the parent", () => {
    const clamped = clampIconGeometryToParent(
      { x: 40, y: 360, width: 600, height: 80, rotation: 0 },
      parent,
    );
    expect(clamped).toMatchObject({ x: 100, y: 320, width: 400, height: 80 });
    expect(fullyContains(parent, clamped)).toBe(true);
  });
});
