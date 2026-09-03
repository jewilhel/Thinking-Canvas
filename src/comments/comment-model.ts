import { z } from "zod";

import type { CanvasObjectV2 } from "@/canvas/canvas-document";
import type { CanvasRole } from "@/domain/command";
import {
  DOCUMENT_RANGE_ANCHOR_MAX_LENGTH,
  DOCUMENT_RANGE_QUOTE_MAX_LENGTH,
  type DocumentRangeTarget,
} from "@/documents/document-range";

export const commentPromptKindSchema = z.enum(["yes_no", "review", "rating"]);
export const commentStatusSchema = z.enum(["open", "resolved", "dismissed"]);
export const commentAuthorKindSchema = z.enum(["human", "ai"]);

const strictText = z.string().trim().min(1).max(100_000);
const uuid = z.uuid();
export const documentRangeTargetSchema = z.strictObject({
  documentObjectId: uuid,
  anchor: z.string().min(1).max(DOCUMENT_RANGE_ANCHOR_MAX_LENGTH),
  head: z.string().min(1).max(DOCUMENT_RANGE_ANCHOR_MAX_LENGTH),
  quote: z.string().min(1).max(DOCUMENT_RANGE_QUOTE_MAX_LENGTH),
});

export const commentRoutingSchema = z.strictObject({
  recipientUserIds: z.array(uuid).max(100),
  includePrimaryAi: z.boolean(),
});

export const commentCreateCommandSchema = z
  .strictObject({
    type: z.literal("comment.create"),
    commandId: uuid,
    canvasId: uuid,
    body: strictText,
    targetObjectIds: z.array(uuid).max(100),
    orderedContextIds: z
      .array(uuid)
      .max(1_000)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "Ordered context objects must be unique.",
      }),
    canvasAnchor: z
      .strictObject({
        x: z.number().finite().min(-1_000_000_000).max(1_000_000_000),
        y: z.number().finite().min(-1_000_000_000).max(1_000_000_000),
      })
      .nullable(),
    documentRange: documentRangeTargetSchema.nullable(),
    promptKind: commentPromptKindSchema.nullable(),
    authorKind: commentAuthorKindSchema,
    authorKey: z.string().min(1).max(255).nullable(),
    routing: commentRoutingSchema.optional(),
  })
  .superRefine((command, context) => {
    const targetFamilies = [
      command.targetObjectIds.length > 0,
      command.canvasAnchor !== null,
      command.documentRange !== null,
    ].filter(Boolean).length;
    if (targetFamilies !== 1) {
      context.addIssue({
        code: "custom",
        message:
          "Choose exactly one object target set, canvas position, or document range.",
        path: ["targetObjectIds"],
      });
    }
  });

export const commentReplyCommandSchema = z.strictObject({
  type: z.literal("comment.reply"),
  commandId: uuid,
  commentId: uuid,
  body: strictText,
  routing: commentRoutingSchema.optional(),
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

export const commentPromptSetCommandSchema = z.strictObject({
  type: z.literal("comment.prompt.set"),
  commentId: uuid,
  promptKind: commentPromptKindSchema.nullable(),
});

export const commentBodyUpdateCommandSchema = z.strictObject({
  type: z.literal("comment.body.update"),
  commentId: uuid,
  body: strictText,
});

export const commentStatusCommandSchema = z.strictObject({
  type: z.literal("comment.status"),
  commentId: uuid,
  status: z.enum(["resolved", "dismissed"]),
});

export const commentDeleteCommandSchema = z.strictObject({
  type: z.literal("comment.delete"),
  commentId: uuid,
});

export const commentCommandSchema = z.discriminatedUnion("type", [
  commentCreateCommandSchema,
  commentReplyCommandSchema,
  commentResponseCommandSchema,
  commentPromptSetCommandSchema,
  commentBodyUpdateCommandSchema,
  commentStatusCommandSchema,
  commentDeleteCommandSchema,
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
  authorKind: "human" | "ai";
  authorKey: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  recipients: CommentRecipient[];
  evidence: Array<{ objectId: string; label: string }>;
  aiTransaction: {
    changeSetId: string;
    status: "active" | "undone" | "unavailable";
  } | null;
};

export type CommentRecipient = {
  kind: "human" | "ai";
  key: string;
  name: string;
};

export type CommentCollaborator = CommentRecipient & {
  role: CanvasRole | "primary_ai";
};

export type CanvasAiAccess = {
  enabled: boolean;
  configuredAuthority:
    "comment_only" | "propose_changes" | "edit_with_review" | "trusted_editor";
  effectiveAuthority:
    | "comment_only"
    | "propose_changes"
    | "edit_with_review"
    | "trusted_editor"
    | null;
  canManage: boolean;
  version: number;
};

export type CommentCollaboration = {
  collaborators: CommentCollaborator[];
  aiAccess: CanvasAiAccess;
};

export type CommentAiRun = {
  id: string;
  status:
    | "queued"
    | "projecting"
    | "thinking"
    | "tool_pending"
    | "applying"
    | "completed"
    | "cancelled"
    | "failed";
  requestedBy: string;
  invokingReplyId: string | null;
  outputReplyId: string | null;
  errorCode: string | null;
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
  canvasAnchor: { x: number; y: number } | null;
  documentRange: DocumentRangeTarget | null;
  replies: CommentReply[];
  recipients: CommentRecipient[];
  activeParticipants: CommentRecipient[];
  aiRuns: CommentAiRun[];
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
  const selectedInOrder = selected.map((object) => object.id);
  const selectedGroup = [...selectedInOrder].sort();
  return completeGroup.length === selectedGroup.length &&
    completeGroup.every((id, index) => id === selectedGroup[index])
    ? selectedInOrder
    : null;
}

export function commentOrderedContextIds(
  objects: CanvasObjectV2[],
  selectedIds: string[],
  targetObjectIds: string[],
) {
  if (
    selectedIds.length < 2 ||
    targetObjectIds.length !== 1 ||
    !selectedIds.includes(targetObjectIds[0]!)
  ) {
    return [];
  }
  const existingIds = new Set(objects.map((object) => object.id));
  return selectedIds.every((id) => existingIds.has(id)) ? [...selectedIds] : [];
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
