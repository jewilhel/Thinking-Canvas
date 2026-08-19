import { z } from "zod";

import type { CanvasObjectV2 } from "@/canvas/canvas-document";

export const commentPromptKindSchema = z.enum(["yes_no", "review", "rating"]);
export const commentStatusSchema = z.enum(["open", "resolved", "dismissed"]);
export const commentAuthorKindSchema = z.enum(["human", "ai"]);

const strictText = z.string().trim().min(1).max(100_000);
const uuid = z.uuid();

export const commentCreateCommandSchema = z.strictObject({
  type: z.literal("comment.create"),
  commandId: uuid,
  canvasId: uuid,
  body: strictText,
  targetObjectIds: z.array(uuid).min(1).max(100),
  promptKind: commentPromptKindSchema.nullable(),
  authorKind: commentAuthorKindSchema,
  authorKey: z.string().min(1).max(255).nullable(),
});

export const commentReplyCommandSchema = z.strictObject({
  type: z.literal("comment.reply"),
  commandId: uuid,
  commentId: uuid,
  body: strictText,
});

export const yesNoResponseSchema = z.strictObject({
  answer: z.enum(["yes", "no"]),
});
export const reviewResponseSchema = z.strictObject({
  decision: z.enum(["approve", "revise", "discard"]),
});
export const ratingResponseSchema = z.strictObject({
  rating: z.number().int().min(1).max(5),
});

export const commentResponseCommandSchema = z.strictObject({
  type: z.literal("comment.respond"),
  commandId: uuid,
  promptId: uuid,
  promptKind: commentPromptKindSchema,
  value: z.unknown(),
});

export const commentStatusCommandSchema = z.strictObject({
  type: z.literal("comment.status"),
  commentId: uuid,
  status: z.enum(["resolved", "dismissed"]),
});

export const commentCommandSchema = z.discriminatedUnion("type", [
  commentCreateCommandSchema,
  commentReplyCommandSchema,
  commentResponseCommandSchema,
  commentStatusCommandSchema,
]);

export type CommentPromptKind = z.infer<typeof commentPromptKindSchema>;
export type CommentStatus = z.infer<typeof commentStatusSchema>;
export type CommentCommand = z.infer<typeof commentCommandSchema>;
export type PromptResponseValue =
  | z.infer<typeof yesNoResponseSchema>
  | z.infer<typeof reviewResponseSchema>
  | z.infer<typeof ratingResponseSchema>;

export type CommentReply = {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type CommentResponse = {
  id: string;
  responderId: string;
  responderName: string;
  value: PromptResponseValue;
  createdAt: string;
  updatedAt: string;
};

export type CommentPrompt = {
  id: string;
  kind: CommentPromptKind;
  minimum: number | null;
  maximum: number | null;
  responses: CommentResponse[];
};

export type CommentThread = {
  id: string;
  canvasId: string;
  authorId: string;
  authorKind: "human" | "ai";
  authorKey: string;
  authorName: string;
  body: string;
  status: CommentStatus;
  createdAt: string;
  updatedAt: string;
  targetObjectIds: string[];
  replies: CommentReply[];
  prompt: CommentPrompt | null;
};

export function parsePromptResponse(
  kind: CommentPromptKind,
  value: unknown,
): PromptResponseValue {
  if (kind === "yes_no") return yesNoResponseSchema.parse(value);
  if (kind === "review") return reviewResponseSchema.parse(value);
  return ratingResponseSchema.parse(value);
}

export function commentTargetObjectIds(
  objects: CanvasObjectV2[],
  selectedIds: string[],
) {
  const selected = selectedIds.flatMap((id) => {
    const object = objects.find((candidate) => candidate.id === id);
    return object ? [object] : [];
  });
  if (selected.length !== selectedIds.length || selected.length === 0) {
    return null;
  }
  if (selected.length === 1) return [selected[0]!.id];

  const groupId = selected[0]?.groupId;
  if (!groupId || selected.some((object) => object.groupId !== groupId)) {
    return null;
  }
  const completeGroup = objects
    .filter((object) => object.groupId === groupId)
    .map((object) => object.id)
    .sort();
  const selectedGroup = selected.map((object) => object.id).sort();
  return completeGroup.length === selectedGroup.length &&
    completeGroup.every((id, index) => id === selectedGroup[index])
    ? selectedGroup
    : null;
}

export function compareChronologically(
  left: { createdAt: string; id: string },
  right: { createdAt: string; id: string },
) {
  return (
    left.createdAt.localeCompare(right.createdAt) ||
    left.id.localeCompare(right.id)
  );
}
