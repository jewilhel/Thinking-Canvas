import { describe, expect, it } from "vitest";

import type { CanvasGroupV2, CanvasObjectV2 } from "@/canvas/canvas-document";
import {
  boundParentGeometryToChildren,
  childRelativeAfterParentResize,
  childWorldGeometry,
  clampIconGeometryToParent,
  fullyContains,
  flipGeometryWithinParent,
  geometryClipPolygonInLocalSpace,
  geometryContainsPoint,
  parentFirstObjectOrder,
  parentRelativeGeometry,
  reorderCanvasObjectLayer,
  rotateGeometryAroundCenter,
  rotationHandleWorldPoint,
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

  it("applies every horizontal and vertical constraint independently", () => {
    const resizedParent = {
      ...parent,
      geometry: { ...parent.geometry, width: 800, height: 400 },
    };
    const horizontal = {
      left: { x: 200, width: 100 },
      right: { x: 600, width: 100 },
      "left-right": { x: 200, width: 500 },
      center: { x: 450, width: 100 },
      scale: { x: 300, width: 200 },
    } as const;
    const vertical = {
      top: { y: 250, height: 100 },
      bottom: { y: 450, height: 100 },
      "top-bottom": { y: 250, height: 300 },
      center: { y: 350, height: 100 },
      scale: { y: 300, height: 200 },
    } as const;

    for (const [horizontalConstraint, horizontalExpected] of Object.entries(
      horizontal,
    )) {
      for (const [verticalConstraint, verticalExpected] of Object.entries(
        vertical,
      )) {
        const constrained = {
          ...child,
          childLayout: {
            horizontalConstraint:
              horizontalConstraint as keyof typeof horizontal,
            verticalConstraint: verticalConstraint as keyof typeof vertical,
          },
        };
        const relative = childRelativeAfterParentResize(
          constrained,
          parent,
          resizedParent,
        );
        expect(
          childWorldGeometry(
            { ...constrained, parentRelative: relative },
            resizedParent,
          ),
        ).toMatchObject({ ...horizontalExpected, ...verticalExpected });
      }
    }
  });

  it("maps legacy layout records deterministically", () => {
    const resizedParent = {
      ...parent,
      geometry: { ...parent.geometry, width: 800, height: 400 },
    };
    const legacy = {
      ...child,
      childLayout: {
        horizontalPosition: "center" as const,
        verticalPosition: "pin" as const,
        scaleWidth: false,
        scaleHeight: true,
      },
    };
    const relative = childRelativeAfterParentResize(
      legacy,
      parent,
      resizedParent,
    );
    expect(
      childWorldGeometry(
        { ...legacy, parentRelative: relative },
        resizedParent,
      ),
    ).toMatchObject({ x: 450, y: 300, width: 100, height: 200 });
  });

  it("bounds modifier resize at unchanged child extents", () => {
    expect(
      boundParentGeometryToChildren(
        parent,
        { ...parent.geometry, width: 150 },
        [child],
      ),
    ).toMatchObject({ x: 100, width: 200 });
    expect(
      boundParentGeometryToChildren(
        parent,
        { ...parent.geometry, x: 250, width: 250 },
        [child],
      ),
    ).toMatchObject({ x: 200, width: 300 });
  });

  it("renders each parent before its children while preserving sibling order", () => {
    const sibling = {
      ...child,
      id: "55555555-5555-4555-8555-555555555555",
      iconName: "clock",
    };
    const independent = {
      ...child,
      id: "66666666-6666-4666-8666-666666666666",
      parentId: null,
      parentRelative: null,
    };
    expect(
      parentFirstObjectOrder([child, independent, parent, sibling]).map(
        (object) => object.id,
      ),
    ).toEqual([independent.id, parent.id, child.id, sibling.id]);
  });

  it("reorders visual layer units without splitting parents or groups", () => {
    const sibling = {
      ...parent,
      id: "55555555-5555-4555-8555-555555555555",
      geometry: { ...parent.geometry, x: 500 },
    };
    const siblingChild = {
      ...child,
      id: "66666666-6666-4666-8666-666666666666",
      parentId: sibling.id,
    };
    const groupedA = {
      ...child,
      id: "77777777-7777-4777-8777-777777777777",
      parentId: null,
      parentRelative: null,
      groupId: "99999999-9999-4999-8999-999999999999",
    };
    const groupedB = {
      ...groupedA,
      id: "88888888-8888-4888-8888-888888888888",
    };
    const group = {
      schemaVersion: 2,
      id: groupedA.groupId,
      canvasId: shared.canvasId,
      createdBy: shared.createdBy,
      createdAt: shared.createdAt,
      updatedAt: shared.updatedAt,
      geometry: { x: 300, y: 200, width: 100, height: 80, rotation: 0 },
      parentId: null,
      parentRelative: null,
      childLayout: null,
    } satisfies CanvasGroupV2;
    const objects = [parent, child, groupedA, groupedB, sibling, siblingChild];

    expect(
      reorderCanvasObjectLayer(objects, [group], parent.id, "front"),
    ).toEqual([
      groupedA.id,
      groupedB.id,
      sibling.id,
      siblingChild.id,
      parent.id,
      child.id,
    ]);
    expect(
      reorderCanvasObjectLayer(objects, [group], groupedA.id, "back"),
    ).toEqual([
      groupedA.id,
      groupedB.id,
      parent.id,
      child.id,
      sibling.id,
      siblingChild.id,
    ]);
    expect(
      reorderCanvasObjectLayer(objects, [group], parent.id, "forward"),
    ).toEqual([
      groupedA.id,
      groupedB.id,
      parent.id,
      child.id,
      sibling.id,
      siblingChild.id,
    ]);
    expect(
      reorderCanvasObjectLayer(
        [parent, child, siblingChild, sibling],
        [],
        siblingChild.id,
        "back",
      ),
    ).toEqual([parent.id, child.id, sibling.id, siblingChild.id]);
  });

  it("rotates around the visual center and locates every corner handle", () => {
    const geometry = {
      x: 100,
      y: 200,
      width: 120,
      height: 80,
      rotation: 0,
    };
    expect(rotateGeometryAroundCenter(geometry, 180)).toMatchObject({
      x: 220,
      y: 280,
      rotation: 180,
    });
    expect(rotationHandleWorldPoint(geometry, "top-left", 18)).toEqual({
      x: 82,
      y: 182,
    });
    expect(rotationHandleWorldPoint(geometry, "top-right", 18)).toEqual({
      x: 238,
      y: 182,
    });
    expect(rotationHandleWorldPoint(geometry, "bottom-left", 18)).toEqual({
      x: 82,
      y: 298,
    });
    expect(rotationHandleWorldPoint(geometry, "bottom-right", 18)).toEqual({
      x: 238,
      y: 298,
    });
  });

  it("mirrors child geometry through a parent-local axis", () => {
    const horizontal = flipGeometryWithinParent(
      child.geometry,
      parent,
      "horizontal",
    );
    expect(horizontal).toMatchObject({
      x: 300,
      y: 250,
      width: 100,
      height: 100,
      rotation: 0,
      flipX: true,
    });
    expect(
      flipGeometryWithinParent(horizontal, parent, "horizontal"),
    ).toMatchObject(child.geometry);
  });

  it("hit-tests rotated children and keeps parent clipping in child-local space", () => {
    const rotatedParent = {
      ...parent,
      geometry: { ...parent.geometry, rotation: 90 },
    };
    const rotatedChild = {
      ...child,
      geometry: childWorldGeometry(child, rotatedParent),
    };
    const center = {
      x: rotatedChild.geometry.x - rotatedChild.geometry.height / 2,
      y: rotatedChild.geometry.y + rotatedChild.geometry.width / 2,
    };
    expect(
      geometryContainsPoint(rotatedChild.geometry, center.x, center.y),
    ).toBe(true);
    expect(geometryContainsPoint(rotatedChild.geometry, 0, 0)).toBe(false);

    const clip = geometryClipPolygonInLocalSpace(
      rotatedParent.geometry,
      rotatedChild.geometry,
    );
    expect(clip).toHaveLength(4);
    expect(clip[0]).toEqual({ x: -100, y: -50 });
    expect(clip[1]).toEqual({ x: 300, y: -50 });
    expect(clip[2]).toEqual({ x: 300, y: 150 });
    expect(clip[3]!.x).toBeCloseTo(-100);
    expect(clip[3]!.y).toBeCloseTo(150);
  });
});
