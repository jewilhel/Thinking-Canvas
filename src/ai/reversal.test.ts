import { describe, expect, it } from "vitest";

import {
  reverseAiObjectChange,
  type AiObjectChangeRecord,
} from "@/ai/reversal";
import type { CanvasObject } from "@/domain/canvas-object";

const now = "2026-08-11T16:00:00.000Z";
const reversedAt = "2026-08-11T16:05:00.000Z";
const before: CanvasObject = {
  schemaVersion: 1,
  id: "33333333-3333-4333-8333-333333333333",
  canvasId: "11111111-1111-4111-8111-111111111111",
  createdBy: "22222222-2222-4222-8222-222222222222",
  createdAt: now,
  updatedAt: now,
  type: "text",
  text: "Original thought",
  geometry: { x: 10, y: 20, width: 240, height: 80, rotation: 0 },
};
const after: CanvasObject = {
  ...before,
  text: "AI rewrite",
  updatedAt: "2026-08-11T16:01:00.000Z",
};
const change: AiObjectChangeRecord = {
  objectId: before.id,
  before,
  after,
  affectedFields: ["text"],
  explanation: "Rewrote the selected thought.",
};

describe("reverseAiObjectChange", () => {
  it("restores the recorded prior field value", () => {
    const result = reverseAiObjectChange(change, after, reversedAt);

    expect(result.status).toBe("reversed");
    expect(result.restoredFields).toEqual(["text"]);
    expect(result.object).toMatchObject({
      text: "Original thought",
      updatedAt: reversedAt,
    });
  });

  it("preserves a later unrelated human geometry edit", () => {
    const movedByHuman: CanvasObject = {
      ...after,
      geometry: { ...after.geometry, x: 640, y: 360 },
      updatedAt: "2026-08-11T16:03:00.000Z",
    };
    const result = reverseAiObjectChange(change, movedByHuman, reversedAt);

    expect(result.status).toBe("reversed");
    expect(result.object).toMatchObject({
      text: "Original thought",
      geometry: { x: 640, y: 360 },
    });
  });

  it("does not overwrite a later human edit to the same field", () => {
    const editedByHuman: CanvasObject = {
      ...after,
      text: "Human follow-up",
      updatedAt: "2026-08-11T16:03:00.000Z",
    };
    const result = reverseAiObjectChange(change, editedByHuman, reversedAt);

    expect(result.status).toBe("conflict");
    expect(result.conflictedFields).toEqual(["text"]);
    expect(result.object).toEqual(editedByHuman);
  });
});
