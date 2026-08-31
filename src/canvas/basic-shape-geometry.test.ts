import { describe, expect, it } from "vitest";

import {
  basicShapePath,
  basicShapePoints,
  type BasicShapeKind,
} from "@/canvas/basic-shape-geometry";

describe("basic shape geometry", () => {
  it.each([
    ["diamond", 4],
    ["triangle", 3],
    ["pentagon", 5],
    ["hexagon", 6],
    ["octagon", 8],
    ["star", 10],
  ] as const)("builds %s with %i vertices", (shape, vertices) => {
    expect(basicShapePoints(shape, 180, 110)).toHaveLength(vertices * 2);
  });

  it.each(["cloud", "speech-bubble"] as const)(
    "builds a closed %s path",
    (shape) => {
      expect(basicShapePath(shape, 180, 110)).toMatch(/^M .+ Z$/);
    },
  );

  it.each([
    "rectangle",
    "rounded-rectangle",
    "ellipse",
    "cylinder",
  ] satisfies BasicShapeKind[])(
    "leaves %s to its dedicated renderer",
    (shape) => {
      expect(basicShapePoints(shape, 180, 110)).toBeNull();
      expect(basicShapePath(shape, 180, 110)).toBeNull();
    },
  );
});
