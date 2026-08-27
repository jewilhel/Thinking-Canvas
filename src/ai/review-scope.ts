import { z } from "zod";

import type { StagedCanvasObjectChange } from "@/ai/proposals";

export const aiReviewScopeSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("single_object"),
    objectIds: z.array(z.uuid()).length(1),
  }),
  z.strictObject({
    kind: z.literal("explicit_context"),
    objectIds: z.array(z.uuid()).min(2).max(1_000),
  }),
  z.strictObject({
    kind: z.literal("world_space"),
    objectIds: z.array(z.uuid()).length(0),
  }),
]);

export type AiReviewScope = z.infer<typeof aiReviewScopeSchema>;

export class AiReviewScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiReviewScopeError";
  }
}

export function deriveAiReviewScope(input: {
  targetObjectIds: string[];
  orderedContextIds: string[];
  hasCanvasAnchor: boolean;
}): AiReviewScope {
  const objectIds = input.orderedContextIds.length
    ? input.orderedContextIds
    : input.targetObjectIds;
  if (new Set(objectIds).size !== objectIds.length) {
    throw new AiReviewScopeError(
      "The review context contains duplicate objects.",
    );
  }
  if (objectIds.length === 1) {
    return aiReviewScopeSchema.parse({ kind: "single_object", objectIds });
  }
  if (objectIds.length > 1) {
    return aiReviewScopeSchema.parse({ kind: "explicit_context", objectIds });
  }
  if (input.hasCanvasAnchor) {
    return aiReviewScopeSchema.parse({ kind: "world_space", objectIds: [] });
  }
  throw new AiReviewScopeError(
    "The source comment has no valid review target.",
  );
}

export function assertReviewChangesWithinScope(input: {
  scope: AiReviewScope;
  changes: StagedCanvasObjectChange[];
}) {
  const affectedIds = input.changes.map((change) => change.objectId);
  if (new Set(affectedIds).size !== affectedIds.length) {
    throw new AiReviewScopeError("Review changes must have unique object IDs.");
  }
  if (input.scope.kind === "world_space") return;
  const allowed = new Set(input.scope.objectIds);
  if (affectedIds.some((id) => !allowed.has(id))) {
    throw new AiReviewScopeError(
      input.scope.kind === "single_object"
        ? "This object comment can change only its directly attached object. Start a canvas comment for a multi-object change."
        : "This review change is outside the comment's explicit object context.",
    );
  }
  if (
    input.scope.kind === "single_object" &&
    input.changes.some((change) => change.beforeState.object === null)
  ) {
    throw new AiReviewScopeError(
      "A directly attached object comment cannot create another object.",
    );
  }
}
