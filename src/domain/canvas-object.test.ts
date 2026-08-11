import { describe, expect, it } from "vitest";

import { canvasObjectSchema } from "@/domain/canvas-object";

const base = {
  schemaVersion: 1 as const,
  id: "33333333-3333-4333-8333-333333333333",
  canvasId: "11111111-1111-4111-8111-111111111111",
  createdBy: "22222222-2222-4222-8222-222222222222",
  createdAt: "2026-08-10T20:00:00.000Z",
  updatedAt: "2026-08-10T20:00:00.000Z",
  geometry: { x: 0, y: 0, width: 100, height: 80, rotation: 0 },
};

describe("canvasObjectSchema", () => {
  it.each([
    { ...base, type: "shape", shape: "rectangle", text: "Idea" },
    { ...base, type: "text", text: "A longer note" },
    {
      ...base,
      type: "connector",
      startObjectId: null,
      endObjectId: null,
      points: [0, 0, 100, 100],
    },
    { ...base, type: "table", cells: [["A", "B"]] },
    {
      ...base,
      type: "document",
      documentId: "44444444-4444-4444-8444-444444444444",
      title: "Working document",
    },
    {
      ...base,
      type: "annotation",
      points: [0, 0, 20, 20],
      temporary: true,
      attachedObjectId: null,
    },
  ])("accepts the renderer-independent $type object", (object) => {
    expect(canvasObjectSchema.parse(object)).toMatchObject(object);
  });

  it("rejects renderer-owned serialization fields", () => {
    expect(() =>
      canvasObjectSchema.parse({
        ...base,
        type: "text",
        text: "No renderer state",
        konvaNode: { className: "Text" },
      }),
    ).toThrow();
  });

  it("rejects non-finite geometry", () => {
    expect(() =>
      canvasObjectSchema.parse({
        ...base,
        type: "text",
        text: "Invalid position",
        geometry: { ...base.geometry, x: Number.POSITIVE_INFINITY },
      }),
    ).toThrow();
  });
});
