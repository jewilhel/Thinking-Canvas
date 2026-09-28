import { describe, expect, it } from "vitest";
import type { CanvasObjectV2, CanvasGroupV2 } from "./canvas-document";
import { dragPreviewPositionsForSelection } from "./drag-preview";
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

function shape(id: string, parentId: string | null = null): CanvasObjectV2 {
  return {
    ...shared,
    id,
    type: "shape",
    shape: "rectangle",
    text: "",
    parentId,
    geometry: { x: 100, y: 200, width: 100, height: 50, rotation: 0 },
  };
}
function label(id: string, parentId: string): CanvasObjectV2 {
  return {
    ...shared,
    id,
    type: "text",
    text: id,
    parentId,
    childRole: "shape-label",
    geometry: { x: 110, y: 210, width: 80, height: 30, rotation: 0 },
  };
}
describe("nested drag preview", () => {
  it("moves both child labels with the outer parent before release, independent of object order", () => {
    const outer = shape("outer");
    const left = shape("left", "outer"),
      right = shape("right", "outer");
    const objects = [
      label("right-label", "right"),
      label("left-label", "left"),
      right,
      left,
      outer,
      shape("unrelated"),
    ];
    const preview = dragPreviewPositionsForSelection(
      objects,
      [],
      [outer, left],
      75,
      -40,
    );
    expect(Object.keys(preview).sort()).toEqual([
      "left",
      "left-label",
      "outer",
      "right",
      "right-label",
    ]);
    expect(preview["left-label"]).toEqual({ x: 185, y: 170 });
    expect(preview["right-label"]).toEqual({ x: 185, y: 170 });
    expect(preview.left).toEqual({ x: 175, y: 160 });
    expect(left.geometry.x).toBe(100);
  });
  it("includes labels below a group nested in the moving parent", () => {
    const outer = shape("outer");
    const member = { ...shape("member"), groupId: "group" };
    const group: CanvasGroupV2 = {
      ...shared,
      id: "group",
      parentId: "outer",
      parentRelative: null,
      childLayout: null,
      geometry: outer.geometry,
    };
    const preview = dragPreviewPositionsForSelection(
      [label("label", "member"), member, outer],
      [group],
      [outer],
      20,
      30,
    );
    expect(preview.label).toEqual({ x: 130, y: 240 });
    expect(preview.member).toEqual({ x: 120, y: 230 });
  });
});
