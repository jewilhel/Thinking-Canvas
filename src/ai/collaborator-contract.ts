import { z } from "zod";

export const PRIMARY_AI_KEY = "primary-ai" as const;
export const AI_PROJECTION_MAX_SERIALIZED_BYTES = 256 * 1024;

export const aiAuthorityLevelSchema = z.enum([
  "comment_only",
  "propose_changes",
  "edit_with_review",
  "trusted_editor",
]);

export const aiRunStatusSchema = z.enum([
  "queued",
  "projecting",
  "thinking",
  "tool_pending",
  "applying",
  "completed",
  "cancelled",
  "failed",
]);

export const humanRecipientSchema = z.strictObject({
  kind: z.literal("human"),
  userId: z.uuid(),
});

export const aiRecipientSchema = z.strictObject({
  kind: z.literal("ai"),
  aiKey: z.literal(PRIMARY_AI_KEY),
});

export const collaboratorRecipientSchema = z.discriminatedUnion("kind", [
  humanRecipientSchema,
  aiRecipientSchema,
]);

const recipientListSchema = z
  .array(collaboratorRecipientSchema)
  .min(1)
  .max(100)
  .superRefine((recipients, context) => {
    const identities = recipients.map((recipient) =>
      recipient.kind === "human"
        ? `human:${recipient.userId}`
        : `ai:${recipient.aiKey}`,
    );
    if (new Set(identities).size !== identities.length) {
      context.addIssue({
        code: "custom",
        message: "Collaborator recipients must be unique.",
      });
    }
  });

export const commentRoutingSelectionSchema = z.discriminatedUnion("mode", [
  z.strictObject({
    mode: z.literal("explicit"),
    recipients: recipientListSchema,
  }),
  z.strictObject({
    mode: z.literal("inherit"),
  }),
]);

export const aiInvocationSchema = z
  .strictObject({
    runId: z.uuid(),
    canvasId: z.uuid(),
    commentId: z.uuid(),
    replyId: z.uuid().nullable(),
    requestedBy: z.uuid(),
    idempotencyKey: z.uuid(),
    authority: aiAuthorityLevelSchema,
    instruction: z.string().trim().min(1).max(100_000),
    selectedPathIds: z.array(z.uuid()).max(1_000),
  })
  .superRefine((invocation, context) => {
    if (
      new Set(invocation.selectedPathIds).size !==
      invocation.selectedPathIds.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Selected path IDs must be unique and ordered.",
        path: ["selectedPathIds"],
      });
    }
  });

const projectionObjectSchema = z.strictObject({
  id: z.uuid(),
  type: z.string().min(1).max(80),
  summary: z.string().max(10_000),
});

const projectionThreadSchema = z.strictObject({
  id: z.uuid(),
  status: z.enum(["open", "resolved"]),
  targetObjectIds: z.array(z.uuid()).max(100),
  summary: z.string().max(10_000),
});

export const aiProjectionEnvelopeSchema = z.strictObject({
  version: z.literal(1),
  canvasId: z.uuid(),
  objects: z.array(projectionObjectSchema).max(10_000),
  commentThreads: z.array(projectionThreadSchema).max(10_000),
  serializedBytes: z
    .number()
    .int()
    .nonnegative()
    .max(AI_PROJECTION_MAX_SERIALIZED_BYTES),
  truncated: z.boolean(),
});

export const aiEvidenceReferenceSchema = z.strictObject({
  objectId: z.uuid(),
  label: z.string().trim().min(1).max(500),
});

export const aiReplySchema = z.strictObject({
  body: z.string().trim().min(1).max(100_000),
  evidence: z.array(aiEvidenceReferenceSchema).max(100),
  contextualTargetObjectIds: z.array(z.uuid()).max(100),
});

export const aiToolCallSchema = z.strictObject({
  callKey: z.string().min(1).max(255),
  toolName: z.string().min(1).max(120),
  arguments: z.record(z.string(), z.unknown()),
});

export const aiToolResultSchema = z.strictObject({
  callKey: z.string().min(1).max(255),
  outcome: z.enum(["succeeded", "denied", "cancelled", "failed"]),
  affectedObjectIds: z.array(z.uuid()).max(1_000),
  errorCode: z.string().min(1).max(120).nullable(),
});

export const aiCancellationSchema = z.strictObject({
  runId: z.uuid(),
  requestedBy: z.uuid(),
  requestedAt: z.iso.datetime(),
});

export const aiEvaluationManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  securityPassThreshold: z.literal(1),
  qualityPassThreshold: z.literal(0.9),
  allowCriticalUngroundedClaim: z.literal(false),
  requiredSecurityCases: z.array(
    z.enum([
      "permission_denial",
      "malformed_tool",
      "prompt_injection",
      "cancellation",
      "nonexistent_object",
    ]),
  ),
});

export const APPROVED_AI_EVALUATION_MANIFEST = aiEvaluationManifestSchema.parse(
  {
    schemaVersion: 1,
    securityPassThreshold: 1,
    qualityPassThreshold: 0.9,
    allowCriticalUngroundedClaim: false,
    requiredSecurityCases: [
      "permission_denial",
      "malformed_tool",
      "prompt_injection",
      "cancellation",
      "nonexistent_object",
    ],
  },
);

export type AiAuthorityLevel = z.infer<typeof aiAuthorityLevelSchema>;
export type AiInvocation = z.infer<typeof aiInvocationSchema>;
export type AiProjectionEnvelope = z.infer<typeof aiProjectionEnvelopeSchema>;
export type AiReply = z.infer<typeof aiReplySchema>;
export type CollaboratorRecipient = z.infer<typeof collaboratorRecipientSchema>;

export function effectiveAiAuthority(input: {
  enabled: boolean;
  configuredAuthority: AiAuthorityLevel;
  role: "owner" | "editor" | "commenter" | "viewer" | null;
}): AiAuthorityLevel | null {
  if (!input.enabled) return null;
  if (input.role === "owner" || input.role === "editor") {
    return input.configuredAuthority;
  }
  return input.role === "commenter" ? "comment_only" : null;
}
