import { describe, expect, it } from "vitest";

import type { CanvasObjectV2 } from "@/canvas/canvas-document";
import { framingForStoryObjects } from "@/stories/ai-story-framing";

function object(id: string, x: number, y: number): CanvasObjectV2 {
  return {
    schemaVersion: 2,
    id,
    canvasId: "20000000-0000-4000-8000-000000000001",
    createdBy: "10000000-0000-4000-8000-000000000001",
    createdAt: "2026-09-08T00:00:00Z",
    updatedAt: "2026-09-08T00:00:00Z",
    type: "shape",
    shape: "rectangle",
    text: "",
    geometry: { x, y, width: 200, height: 100, rotation: 0 },
    style: {
      fill: "#fff",
      outline: "#000",
      outlineWidth: 2,
      fontFamily: "Inter",
      fontSize: 16,
      textColor: "#000",
    },
    groupId: null,
    parentId: null,
    childLayout: null,
  };
}

describe("framingForStoryObjects", () => {
  it("derives stable padded world-space framing from grounded objects", () => {
    const result = framingForStoryObjects(
      [object("10000000-0000-4000-8000-000000000001", 100, 200)],
      ["10000000-0000-4000-8000-000000000001"],
    );
    expect(result.target.bounds).toEqual({
      x: 20,
      y: 120,
      width: 360,
      height: 260,
    });
    expect(result.camera.center).toEqual({ x: 200, y: 250 });
  });

  it("rejects forged or stale object identities", () => {
    expect(() =>
      framingForStoryObjects(
        [object("10000000-0000-4000-8000-000000000001", 0, 0)],
        ["10000000-0000-4000-8000-000000000002"],
      ),
    ).toThrow("unavailable canvas object");
  });
});
