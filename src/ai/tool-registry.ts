import { z } from "zod";

import type { AiAuthorityLevel } from "@/ai/collaborator-contract";
import { productCanvasMutationSchema } from "@/domain/canvas-command";

const uuid = z.uuid();
const pagingFields = {
  cursor: z.number().int().nonnegative().default(0),
  limit: z.number().int().min(1).max(100).default(25),
};
const mutationListSchema = z.array(productCanvasMutationSchema).min(1).max(50);
export const proposalArgumentsSchema = z.strictObject({
  commands: mutationListSchema,
});
export const reviewStageArgumentsSchema = z.strictObject({
  summary: z.string().trim().min(1).max(10_000),
  commands: mutationListSchema,
});
export const executeArgumentsSchema = z.strictObject({
  commands: mutationListSchema,
});

export const contextualCommentArgumentsSchema = z
  .strictObject({
    body: z.string().trim().min(1).max(100_000),
    targetObjectIds: z.array(uuid).min(1).max(100),
  })
  .superRefine((value, context) => {
    if (new Set(value.targetObjectIds).size !== value.targetObjectIds.length) {
      context.addIssue({
        code: "custom",
        path: ["targetObjectIds"],
        message: "Contextual comment targets must be unique.",
      });
    }
  });

export const AI_TOOL_REGISTRY = {
  inspect_canvas_objects: {
    effect: "read" as const,
    minimumAuthority: "comment_only" as const,
    description:
      "Read a deterministic page of current canvas object detail without changing the canvas.",
    argumentsSchema: z.strictObject({
      objectIds: z.array(uuid).max(100).optional(),
      ...pagingFields,
    }),
  },
  inspect_comment_threads: {
    effect: "read" as const,
    minimumAuthority: "comment_only" as const,
    description:
      "Read a deterministic page of authorized open or resolved comment detail without changing history.",
    argumentsSchema: z.strictObject({
      threadIds: z.array(uuid).max(100).optional(),
      ...pagingFields,
    }),
  },
  create_contextual_comment: {
    effect: "comment" as const,
    minimumAuthority: "comment_only" as const,
    description:
      "Create one AI-authored contextual comment through the existing comment permission and persistence boundary.",
    argumentsSchema: contextualCommentArgumentsSchema,
  },
  propose_canvas_commands: {
    effect: "proposal" as const,
    minimumAuthority: "propose_changes" as const,
    description:
      "Return validated ordered canvas commands as a non-mutating proposal in the originating comment thread.",
    argumentsSchema: proposalArgumentsSchema,
  },
  stage_canvas_changes: {
    effect: "review" as const,
    minimumAuthority: "edit_with_review" as const,
    description:
      "Stage validated pending changes for later Milestone 5 review without changing canonical canvas state.",
    argumentsSchema: reviewStageArgumentsSchema,
  },
  execute_canvas_commands: {
    effect: "mutation" as const,
    minimumAuthority: "trusted_editor" as const,
    description:
      "Execute validated ordered product commands against current durable canvas state with idempotent persistence.",
    argumentsSchema: executeArgumentsSchema,
  },
} as const;

export type AiToolName = keyof typeof AI_TOOL_REGISTRY;

const authorityRank: Record<AiAuthorityLevel, number> = {
  comment_only: 0,
  propose_changes: 1,
  edit_with_review: 2,
  trusted_editor: 3,
};

export function allowedAiToolNames(authority: AiAuthorityLevel) {
  return (Object.keys(AI_TOOL_REGISTRY) as AiToolName[]).filter(
    (name) =>
      authorityRank[authority] >=
      authorityRank[AI_TOOL_REGISTRY[name].minimumAuthority],
  );
}

export class AiToolPermissionError extends Error {
  constructor(readonly toolName: string) {
    super("The current AI authority does not allow this tool.");
    this.name = "AiToolPermissionError";
  }
}

export class AiToolNotFoundError extends Error {
  constructor(readonly toolName: string) {
    super("The requested AI tool is not registered.");
    this.name = "AiToolNotFoundError";
  }
}

export function validateAiToolRequest(input: {
  authority: AiAuthorityLevel;
  toolName: string;
  arguments: unknown;
}) {
  if (!Object.prototype.hasOwnProperty.call(AI_TOOL_REGISTRY, input.toolName)) {
    throw new AiToolNotFoundError(input.toolName);
  }
  const toolName = input.toolName as AiToolName;
  if (!allowedAiToolNames(input.authority).includes(toolName)) {
    throw new AiToolPermissionError(toolName);
  }
  const definition = AI_TOOL_REGISTRY[toolName];
  return {
    toolName,
    effect: definition.effect,
    arguments: definition.argumentsSchema.parse(input.arguments),
  };
}
