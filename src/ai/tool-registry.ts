import { organizeCanvasSchema } from "@/ai/canvas-organization-schema";
import { z } from "zod";
import { canvasNavigationSchema } from "./canvas-navigation";

import type { AiAuthorityLevel } from "@/ai/collaborator-contract";
import { deterministicLayoutRequestSchema } from "@/ai/deterministic-layout";
import { productCanvasMutationSchema } from "@/domain/canvas-command";
import { documentSettingsSchema } from "@/documents/document-schema";

const uuid = z.uuid();
const pagingFields = {
  cursor: z.number().int().nonnegative().default(0),
  limit: z.number().int().min(1).max(100).default(25),
};
const mutationListSchema = z.array(productCanvasMutationSchema).min(1).max(50);
export const reviewExplanationSchema = z.strictObject({
  objectId: uuid,
  whatChanged: z.string().trim().min(1).max(2_000),
  why: z.string().trim().min(1).max(4_000),
});
const reviewExplanationsSchema = z
  .array(reviewExplanationSchema)
  .min(1)
  .max(1_000)
  .superRefine((explanations, context) => {
    if (
      new Set(explanations.map((explanation) => explanation.objectId)).size !==
      explanations.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Review explanation object IDs must be unique.",
      });
    }
  });
export const proposalArgumentsSchema = z.strictObject({
  commands: mutationListSchema,
});
export const reviewStageArgumentsSchema = z.strictObject({
  summary: z.string().trim().min(1).max(10_000),
  commands: mutationListSchema,
  explanations: reviewExplanationsSchema,
});
export const reviewLayoutArgumentsSchema = z.strictObject({
  summary: z.string().trim().min(1).max(10_000),
  layout: deterministicLayoutRequestSchema,
  explanations: reviewExplanationsSchema,
});
const newShapeSpecSchema = z.strictObject({
  key: z.string().trim().min(1).max(120),
  shape: z.enum([
    "rectangle",
    "rounded-rectangle",
    "ellipse",
    "diamond",
    "triangle",
    "pentagon",
    "hexagon",
    "octagon",
    "star",
    "cloud",
    "speech-bubble",
    "cylinder",
  ]),
  layer: z.enum(["front", "back"]).default("front"),
  text: z.string().max(10_000),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().min(24),
  height: z.number().finite().min(24),
  fill: z.string().min(1).max(100),
  outline: z.string().min(1).max(100),
  outlineWidth: z.number().finite().min(0).max(20),
  fontFamily: z.string().min(1).max(200),
  fontSize: z.number().finite().min(8).max(400),
  fontWeight: z.enum(["normal", "bold"]),
  textAlign: z.enum(["left", "center", "right"]),
  textColor: z.string().min(1).max(100),
});
const newShapeExplanationSchema = z.strictObject({
  key: z.string().trim().min(1).max(120),
  whatChanged: z.string().trim().min(1).max(2_000),
  why: z.string().trim().min(1).max(4_000),
});
export const reviewNewShapesArgumentsSchema = z
  .strictObject({
    summary: z.string().trim().min(1).max(10_000),
    shapes: z.array(newShapeSpecSchema).min(1).max(50),
    explanations: z.array(newShapeExplanationSchema).min(1).max(50),
  })
  .superRefine((value, context) => {
    const shapeKeys = value.shapes.map((shape) => shape.key);
    const explanationKeys = value.explanations.map(
      (explanation) => explanation.key,
    );
    if (new Set(shapeKeys).size !== shapeKeys.length) {
      context.addIssue({
        code: "custom",
        message: "New shape keys must be unique.",
      });
    }
    if (new Set(explanationKeys).size !== explanationKeys.length) {
      context.addIssue({
        code: "custom",
        message: "New shape explanation keys must be unique.",
      });
    }
    if (
      shapeKeys.length !== explanationKeys.length ||
      [...shapeKeys]
        .sort()
        .some((key, index) => key !== [...explanationKeys].sort()[index])
    ) {
      context.addIssue({
        code: "custom",
        message:
          "New shape explanations must exactly match the new shape keys.",
      });
    }
  });
export type ReviewNewShapesArguments = z.infer<
  typeof reviewNewShapesArgumentsSchema
>;
const newConnectorSpecSchema = z.strictObject({
  key: z.string().trim().min(1).max(120),
  fromObjectId: uuid,
  toObjectId: uuid,
  outline: z.string().min(1).max(100),
  outlineWidth: z.number().finite().min(1).max(20),
});
export const reviewNewConnectorsArgumentsSchema = z
  .strictObject({
    summary: z.string().trim().min(1).max(10_000),
    connectors: z.array(newConnectorSpecSchema).min(1).max(50),
    explanations: z.array(newShapeExplanationSchema).min(1).max(50),
  })
  .superRefine((value, context) => {
    const connectorKeys = value.connectors.map((connector) => connector.key);
    const explanationKeys = value.explanations.map(
      (explanation) => explanation.key,
    );
    if (new Set(connectorKeys).size !== connectorKeys.length) {
      context.addIssue({
        code: "custom",
        message: "New connector keys must be unique.",
      });
    }
    if (
      connectorKeys.length !== explanationKeys.length ||
      [...connectorKeys]
        .sort()
        .some((key, index) => key !== [...explanationKeys].sort()[index])
    ) {
      context.addIssue({
        code: "custom",
        message:
          "New connector explanations must exactly match the connector keys.",
      });
    }
  });
export type ReviewNewConnectorsArguments = z.infer<
  typeof reviewNewConnectorsArgumentsSchema
>;
const newAnnotationPointSchema = z.strictObject({
  x: z.number().finite(),
  y: z.number().finite(),
  pressure: z.number().finite().min(0).max(1).default(0.5),
});
const newAnnotationSpecSchema = z.strictObject({
  key: z.string().trim().min(1).max(120),
  points: z.array(newAnnotationPointSchema).min(2).max(64),
  outline: z.string().min(1).max(100),
  outlineWidth: z.number().finite().min(1).max(20),
});
export const reviewNewAnnotationsArgumentsSchema = z
  .strictObject({
    summary: z.string().trim().min(1).max(10_000),
    annotations: z.array(newAnnotationSpecSchema).min(1).max(20),
    explanations: z.array(newShapeExplanationSchema).min(1).max(20),
  })
  .superRefine((value, context) => {
    const annotationKeys = value.annotations.map(
      (annotation) => annotation.key,
    );
    const explanationKeys = value.explanations.map(
      (explanation) => explanation.key,
    );
    if (new Set(annotationKeys).size !== annotationKeys.length) {
      context.addIssue({
        code: "custom",
        message: "New annotation keys must be unique.",
      });
    }
    if (
      annotationKeys.length !== explanationKeys.length ||
      [...annotationKeys]
        .sort()
        .some((key, index) => key !== [...explanationKeys].sort()[index])
    ) {
      context.addIssue({
        code: "custom",
        message:
          "New annotation explanations must exactly match the annotation keys.",
      });
    }
  });
export type ReviewNewAnnotationsArguments = z.infer<
  typeof reviewNewAnnotationsArgumentsSchema
>;
export const executeArgumentsSchema = z.strictObject({
  commands: mutationListSchema,
});
export const conversationDocumentArgumentsSchema = z.strictObject({
  kind: z.enum(["summary", "design_brief", "document", "transcript"]),
  destinationDocumentId: z.uuid().nullable().optional(),
  title: z.string().trim().min(1).max(200),
  text: z.string().trim().max(12000),
});

const documentTextFormatSchema = z.enum([
  "plain",
  "bold",
  "italic",
  "bold_italic",
]);
const documentBlockSchema = z.strictObject({
  kind: z.enum([
    "paragraph",
    "heading1",
    "heading2",
    "heading3",
    "heading4",
    "heading5",
    "heading6",
  ]),
  text: z.string().max(100_000),
  format: documentTextFormatSchema.default("plain"),
});
export const documentSemanticOperationSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("replace_selection"),
    text: z.string().max(100_000),
    format: documentTextFormatSchema.default("plain"),
  }),
  z.strictObject({
    kind: z.literal("append_block"),
    block: documentBlockSchema,
  }),
  z.strictObject({
    kind: z.literal("replace_document"),
    blocks: z.array(documentBlockSchema).min(1).max(250),
  }),
]);
export const documentChangesArgumentsSchema = z
  .strictObject({
    summary: z.string().trim().min(1).max(10_000),
    documentObjectId: uuid,
    operations: z.array(documentSemanticOperationSchema).min(1).max(50),
    settings: documentSettingsSchema.optional(),
    objectCommands: z.array(productCanvasMutationSchema).max(50).default([]),
    objectExplanations: z.array(reviewExplanationSchema).max(50).default([]),
    whatChanged: z.string().trim().min(1).max(2_000),
    why: z.string().trim().min(1).max(4_000),
  })
  .superRefine((value, context) => {
    if (
      value.operations.filter(
        (operation) => operation.kind === "replace_selection",
      ).length > 1
    ) {
      context.addIssue({
        code: "custom",
        path: ["operations"],
        message: "A document edit may replace its selected range only once.",
      });
    }
    if (
      value.objectCommands.some(
        (command) =>
          command.type === "document.update" ||
          command.type === "document.duplicate" ||
          command.type === "object.create",
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["objectCommands"],
        message:
          "Document object actions may only modify existing projected internal objects.",
      });
    }
    const explainedIds = value.objectExplanations.map(
      (explanation) => explanation.objectId,
    );
    if (new Set(explainedIds).size !== explainedIds.length) {
      context.addIssue({
        code: "custom",
        path: ["objectExplanations"],
        message: "Document object explanations must be unique.",
      });
    }
  });

export const providerDocumentChangesArgumentsSchema = z.strictObject({
  summary: z.string().trim().min(1).max(10_000),
  documentObjectId: uuid,
  operations: z.array(documentSemanticOperationSchema).min(1).max(50),
  settings: documentSettingsSchema.optional(),
  whatChanged: z.string().trim().min(1).max(2_000),
  why: z.string().trim().min(1).max(4_000),
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

export const storySceneArgumentsSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("create"),
    title: z.string().trim().min(1).max(120),
    narration: z.string().trim().min(1).max(100_000).optional(),
    targetObjectIds: z
      .array(uuid)
      .min(1)
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "Scene framing objects must be unique.",
      }),
  }),
  z
    .strictObject({
      action: z.literal("update_current"),
      title: z.string().trim().min(1).max(120).optional(),
      narration: z.string().trim().min(1).max(100_000).optional(),
    })
    .refine(
      (value) => value.title !== undefined || value.narration !== undefined,
      {
        message: "A current-scene update requires a title or narration.",
      },
    ),
]);

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
  execute_story_scene: {
    effect: "mutation" as const,
    minimumAuthority: "trusted_editor" as const,
    description:
      "Create one grounded scene from live canvas objects or update the invoking scene's title or narration. The server determines scene identity, framing, and order.",
    argumentsSchema: storySceneArgumentsSchema,
  },
  propose_canvas_commands: {
    effect: "proposal" as const,
    minimumAuthority: "propose_changes" as const,
    description:
      "Return validated ordered canvas commands as a non-mutating proposal in the originating comment thread.",
    argumentsSchema: proposalArgumentsSchema,
  },
  propose_document_changes: {
    effect: "proposal" as const,
    minimumAuthority: "propose_changes" as const,
    description:
      "Return a non-mutating proposal for semantic document text, formatting, presentation, or existing internal-object changes. Use only a document ID present in the semantic projection; range operations use the invoking comment range.",
    argumentsSchema: documentChangesArgumentsSchema,
  },
  organize_canvas: {
    effect: "review" as const,
    minimumAuthority: "edit_with_review" as const,
    description:
      "Group or ungroup existing objects, or nest/detach objects and groups in a parent shape. Identify targets by their existing object IDs, including members of an existing group. For nest supply the existing parentId; otherwise parentId is null. The server creates new group identities. Nesting moves the requested object or complete group inside the parent when necessary and proportionally reduces it only when needed to fit; existing placement is preserved when already contained. Applies as one undoable edit. Ask for clarification if the intended parent or targets are ambiguous.",
    argumentsSchema: organizeCanvasSchema,
  },
  stage_canvas_changes: {
    effect: "review" as const,
    minimumAuthority: "edit_with_review" as const,
    description:
      "Apply one validated canvas edit immediately as a single durable, undoable AI transaction. Use for direct content, geometry, style, order, group, or deletion changes that are not better represented by a deterministic layout or creation action.",
    argumentsSchema: reviewStageArgumentsSchema,
  },
  stage_document_changes: {
    effect: "review" as const,
    minimumAuthority: "edit_with_review" as const,
    description:
      "Apply one validated semantic document edit as one durable undoable transaction. Range operations are bounded to the invoking comment range; use existing projected IDs only.",
    argumentsSchema: documentChangesArgumentsSchema,
  },
  stage_layout_changes: {
    effect: "review" as const,
    minimumAuthority: "edit_with_review" as const,
    description:
      "Compute and immediately apply one deterministic alignment, distribution, spacing, compound align-and-space, or resize-to-content operation as a single undoable AI transaction.",
    argumentsSchema: reviewLayoutArgumentsSchema,
  },
  stage_new_shapes: {
    effect: "review" as const,
    minimumAuthority: "edit_with_review" as const,
    description:
      "Create every new shape requested in this turn immediately as one undoable AI transaction and one tool call. Use rectangle shapes for sticky notes. Use layer back only when the user explicitly requests a background or asks for the new shape behind existing content. Supply local keys rather than object IDs; the server creates durable identities and metadata.",
    argumentsSchema: reviewNewShapesArgumentsSchema,
  },
  stage_new_connectors: {
    effect: "review" as const,
    minimumAuthority: "edit_with_review" as const,
    description:
      "Create one or more directional connectors between existing shape objects immediately as one undoable AI transaction. List connections in the requested direction; the server assigns connector identities and chooses safe edge anchors.",
    argumentsSchema: reviewNewConnectorsArgumentsSchema,
  },
  stage_new_annotations: {
    effect: "review" as const,
    minimumAuthority: "edit_with_review" as const,
    description:
      "Create one or more bounded point-based vector annotations immediately as one undoable AI transaction. Supply 2 to 64 world-space points and local keys; the server canonicalizes the path and assigns durable identities and metadata.",
    argumentsSchema: reviewNewAnnotationsArgumentsSchema,
  },
  execute_canvas_commands: {
    effect: "mutation" as const,
    minimumAuthority: "trusted_editor" as const,
    description:
      "Execute validated ordered product commands against current durable canvas state with idempotent persistence.",
    argumentsSchema: executeArgumentsSchema,
  },
  navigate_canvas: {
    effect: "comment" as const,
    minimumAuthority: "comment_only" as const,
    description:
      "Select one or more existing canvas objects, open one named document to inspect/edit it, or close a named/current document and return to the canvas. Navigation changes only the requesting participant's view. Use projected object IDs, never names as IDs. select with an empty list clears selection; close_document with an empty list closes the current document. Clarify ambiguous names. This does not change document content.",
    argumentsSchema: canvasNavigationSchema,
  },
  ask_voice_clarification: {
    effect: "comment" as const,
    minimumAuthority: "comment_only" as const,
    description:
      "Ask one specific question when the participant's intent, target, or required content is ambiguous. Return only this action; do not change the canvas until the participant answers. Do not use this for technical failures or unavailable capabilities.",
    argumentsSchema: z.strictObject({
      question: z.string().trim().min(1).max(1000),
    }),
  },
  manage_comment_thread: {
    effect: "mutation" as const,
    minimumAuthority: "comment_only" as const,
    description:
      "On explicit request: create an unanchored canvas comment, reply to an existing comment, resolve, dismiss, reopen, or permanently delete a comment thread. Use exact IDs from the current comment projection; clarify ambiguous targets. For object-anchored new comments use create_contextual_comment. Reply/create body must preserve the user's requested message; other actions use empty body. A delete removes the entire thread and is not undoable; clarify if intent is unclear. Never target the current invoking request thread.",
    argumentsSchema: z.strictObject({
      action: z.enum([
        "create",
        "reply",
        "resolve",
        "dismiss",
        "reopen",
        "delete",
      ]),
      commentId: z.uuid().nullable(),
      body: z.string().max(12000),
    }),
  },
  undo_last_ai_change: {
    effect: "mutation" as const,
    minimumAuthority: "edit_with_review" as const,
    description:
      "Only when the participant asks to undo the last AI change: reverse the most recent applied undoable AI transaction they requested on this canvas. Preserve unrelated later edits. The server selects the transaction; do not use this to undo a specific older change.",
    argumentsSchema: z.strictObject({}),
  },
  create_conversation_document: {
    effect: "mutation" as const,
    minimumAuthority: "trusted_editor" as const,
    description:
      "Create a new ordinary document, requested conversation summary, design brief, or available transcript only when explicitly requested. Use document for new blank or authored documents; summary/design_brief for conversation synthesis. For transcript pass empty text: the server copies the full captured session wording without model rewriting. Supply destinationDocumentId only when asked to put the result in that existing document (replaces its body); omit/null creates a new document. Summaries and briefs must use the full sessionTranscript source, not only recent command fragments. Never invent missing discussion or save automatically.",
    argumentsSchema: conversationDocumentArgumentsSchema,
  },
  execute_document_changes: {
    effect: "mutation" as const,
    minimumAuthority: "trusted_editor" as const,
    description:
      "Execute one validated semantic document edit immediately against current durable state. Range operations are bounded to the invoking comment range; use existing projected IDs only.",
    argumentsSchema: documentChangesArgumentsSchema,
  },
} as const;

export type AiToolName = keyof typeof AI_TOOL_REGISTRY;

const authorityRank: Record<AiAuthorityLevel, number> = {
  comment_only: 0,
  propose_changes: 1,
  edit_with_review: 2,
  trusted_editor: 3,
};

export function isAiToolAllowedByAuthority(
  authority: AiAuthorityLevel,
  name: AiToolName,
) {
  return (
    authorityRank[authority] >=
    authorityRank[AI_TOOL_REGISTRY[name].minimumAuthority]
  );
}

export function allowedAiToolNames(authority: AiAuthorityLevel) {
  return (Object.keys(AI_TOOL_REGISTRY) as AiToolName[]).filter(
    (name) =>
      name !== "execute_story_scene" &&
      name !== "ask_voice_clarification" &&
      name !== "create_conversation_document" &&
      name !== "undo_last_ai_change" &&
      name !== "manage_comment_thread" &&
      isAiToolAllowedByAuthority(authority, name),
  );
}

/** Voice shares the Canvas AI capabilities, with conversation-specific actions added. */
export function allowedVoiceAiToolNames(authority: AiAuthorityLevel) {
  const names = allowedAiToolNames(authority);
  names.push("manage_comment_thread", "ask_voice_clarification");
  if (authority === "trusted_editor")
    names.push("create_conversation_document");
  if (authority === "trusted_editor" || authority === "edit_with_review")
    names.push("undo_last_ai_change");
  return names;
}

/** Resolve run scope before exposing actions to the provider. */
export function allowedRunAiToolNames(input: {
  authority: AiAuthorityLevel;
  readOnly: boolean;
  voice: boolean;
  scope: "canvas" | "document" | "scene";
}) {
  if (input.readOnly) return [];
  const names =
    input.scope === "document"
      ? [...allowedDocumentRangeAiToolNames(input.authority)]
      : input.scope === "scene"
        ? allowedSceneAiToolNames(input.authority)
        : input.voice
          ? allowedVoiceAiToolNames(input.authority)
          : allowedAiToolNames(input.authority);
  return names;
}

const documentRangeToolNames = new Set<AiToolName>([
  "propose_document_changes",
  "stage_document_changes",
  "execute_document_changes",
]);

export function allowedDocumentRangeAiToolNames(authority: AiAuthorityLevel) {
  if (authority === "trusted_editor") {
    return ["propose_document_changes", "execute_document_changes"] as const;
  }
  if (authority === "edit_with_review") {
    return ["propose_document_changes", "stage_document_changes"] as const;
  }
  const allowed = allowedAiToolNames(authority).filter((name) =>
    documentRangeToolNames.has(name),
  );
  return allowed.length > 0
    ? allowed
    : (["create_contextual_comment"] as const);
}

export function allowedSceneAiToolNames(authority: AiAuthorityLevel) {
  const names: AiToolName[] = [
    "inspect_canvas_objects",
    "inspect_comment_threads",
  ];
  if (authority === "trusted_editor") names.push("execute_story_scene");
  return names;
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
  if (!isAiToolAllowedByAuthority(input.authority, toolName)) {
    throw new AiToolPermissionError(toolName);
  }
  const definition = AI_TOOL_REGISTRY[toolName];
  return {
    toolName,
    effect: definition.effect,
    arguments: definition.argumentsSchema.parse(input.arguments),
  };
}
