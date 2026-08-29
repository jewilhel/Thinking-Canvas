import { describe, expect, it } from "vitest";

import {
  AiReviewScopeError,
  assertReviewChangesWithinScope,
  deriveAiReviewScope,
} from "@/ai/review-scope";
import type { StagedCanvasObjectChange } from "@/ai/proposals";

const first = "61000000-0000-4000-8000-000000000001";
const second = "61000000-0000-4000-8000-000000000002";

function change(
  objectId: string,
  beforeObject: Record<string, unknown> | null = { id: objectId },
): StagedCanvasObjectChange {
  return {
    objectId,
    beforeState: { object: beforeObject as never, orderIndex: 0 },
    afterState: { object: { id: objectId } as never, orderIndex: 0 },
    affectedFields: ["object.geometry.x"],
  };
}

describe("comment-defined AI review scope", () => {
  it("limits direct-object comments to the exact existing target", () => {
    const scope = deriveAiReviewScope({
      targetObjectIds: [first],
      orderedContextIds: [first],
      hasCanvasAnchor: false,
    });
    expect(() =>
      assertReviewChangesWithinScope({
        scope,
        changes: [change(first), change(second)],
      }),
    ).toThrowError(AiReviewScopeError);
    expect(() =>
      assertReviewChangesWithinScope({
        scope,
        changes: [change(first, null)],
      }),
    ).toThrow("cannot create another object");
    expect(() =>
      assertReviewChangesWithinScope({ scope, changes: [change(first)] }),
    ).not.toThrow();
  });

  it("allows one world-space thread to own a multi-object change set", () => {
    const scope = deriveAiReviewScope({
      targetObjectIds: [],
      orderedContextIds: [],
      hasCanvasAnchor: true,
    });
    expect(() =>
      assertReviewChangesWithinScope({
        scope,
        changes: [change(first), change(second)],
      }),
    ).not.toThrow();
  });

  it("keeps explicit multi-object contexts within their resolved IDs", () => {
    const scope = deriveAiReviewScope({
      targetObjectIds: [first, second],
      orderedContextIds: [first, second],
      hasCanvasAnchor: false,
    });
    expect(() =>
      assertReviewChangesWithinScope({ scope, changes: [change(first)] }),
    ).not.toThrow();
    expect(() =>
      assertReviewChangesWithinScope({
        scope,
        changes: [change("61000000-0000-4000-8000-000000000003")],
      }),
    ).toThrow("outside the comment's explicit object context");
  });
});
