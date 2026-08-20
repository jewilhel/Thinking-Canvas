import { describe, expect, it } from "vitest";

import {
  commentCreateCommandSchema,
  commentTargetObjectIds,
  parsePromptResponse,
} from "@/comments/comment-model";
import type { CanvasObjectV2 } from "@/canvas/canvas-document";

function object(id: string, groupId?: string): CanvasObjectV2 {
  return {
    schemaVersion: 2,
    id,
    canvasId: "20000000-0000-4000-8000-000000000001",
    type: "shape",
    shape: "rectangle",
    text: id,
    createdBy: "10000000-0000-4000-8000-000000000001",
    createdAt: "2026-08-19T00:00:00.000Z",
    updatedAt: "2026-08-19T00:00:00.000Z",
    groupId,
    geometry: { x: 0, y: 0, width: 100, height: 80, rotation: 0 },
    style: {
      fill: "#fff",
      outline: "#000",
      outlineWidth: 1,
      fontFamily: "Inter",
      fontSize: 16,
      fontWeight: "normal",
      textAlign: "center",
      listStyle: "none",
      linkUrl: null,
      textColor: "#000",
    },
  };
}

describe("comment model", () => {
  it("accepts only the approved strict prompt response shapes", () => {
    expect(parsePromptResponse("yes_no", { answer: "yes" })).toEqual({
      answer: "yes",
    });
    expect(parsePromptResponse("review", { decision: "revise" })).toEqual({
      decision: "revise",
    });
    expect(parsePromptResponse("rating", { rating: 5 })).toEqual({ rating: 5 });
    expect(() => parsePromptResponse("rating", { rating: 6 })).toThrow();
    expect(() =>
      parsePromptResponse("yes_no", { answer: "yes", extra: true }),
    ).toThrow();
  });

  it("accepts one object or one complete selected group", () => {
    const objects = [object("a"), object("b", "g"), object("c", "g")];
    expect(commentTargetObjectIds(objects, ["a"])).toEqual(["a"]);
    expect(commentTargetObjectIds(objects, ["b", "c"])).toEqual(["b", "c"]);
    expect(commentTargetObjectIds(objects, ["b"])).toEqual(["b"]);
    expect(commentTargetObjectIds(objects, ["a", "b"])).toBeNull();
  });

  it("requires exactly one object target set or finite canvas position", () => {
    const base = {
      type: "comment.create" as const,
      commandId: "71000000-0000-4000-8000-000000000001",
      canvasId: "20000000-0000-4000-8000-000000000001",
      body: "Placed feedback",
      promptKind: null,
      authorKind: "human" as const,
      authorKey: null,
    };
    expect(
      commentCreateCommandSchema.safeParse({
        ...base,
        targetObjectIds: ["61000000-0000-4000-8000-000000000001"],
        canvasAnchor: null,
      }).success,
    ).toBe(true);
    expect(
      commentCreateCommandSchema.safeParse({
        ...base,
        targetObjectIds: [],
        canvasAnchor: { x: 120, y: -40 },
      }).success,
    ).toBe(true);
    expect(
      commentCreateCommandSchema.safeParse({
        ...base,
        targetObjectIds: ["61000000-0000-4000-8000-000000000001"],
        canvasAnchor: { x: 120, y: -40 },
      }).success,
    ).toBe(false);
    expect(
      commentCreateCommandSchema.safeParse({
        ...base,
        targetObjectIds: [],
        canvasAnchor: null,
      }).success,
    ).toBe(false);
    expect(
      commentCreateCommandSchema.safeParse({
        ...base,
        targetObjectIds: [],
        canvasAnchor: { x: Number.POSITIVE_INFINITY, y: 0 },
      }).success,
    ).toBe(false);
  });
});
