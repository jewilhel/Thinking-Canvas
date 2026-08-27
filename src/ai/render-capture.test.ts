import { describe, expect, it } from "vitest";

import { renderTargetedCanvasCapture } from "@/ai/render-capture";

describe("targeted canvas capture", () => {
  it("renders a bounded PNG with nearby visual context", async () => {
    const objects = [0, 220, 1200].map((x, index) => ({
      schemaVersion: 2 as const,
      id: `61000000-0000-4000-8000-00000000000${index + 1}`,
      canvasId: "20000000-0000-4000-8000-000000000001",
      createdBy: "10000000-0000-4000-8000-000000000001",
      createdAt: "2026-08-26T00:00:00.000Z",
      updatedAt: "2026-08-26T00:00:00.000Z",
      type: "shape" as const,
      shape: "rectangle" as const,
      text: `Object ${index + 1}`,
      geometry: { x, y: 0, width: 160, height: 96, rotation: 0 },
      style: {
        fill: "#ffffff",
        outline: "#334155",
        outlineWidth: 2,
        fontFamily: "Inter, sans-serif",
        fontSize: 16,
      },
    }));
    const capture = await renderTargetedCanvasCapture({
      objects,
      targetObjectIds: [objects[0]!.id],
      label: "before",
    });
    expect(capture.dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(capture.contextObjectIds).toEqual([objects[0]!.id, objects[1]!.id]);
    expect(capture.contextObjectIds).not.toContain(objects[2]!.id);
  });
});
