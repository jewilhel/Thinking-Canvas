import * as Y from "yjs";

import {
  listCanvasObjectsV2,
  projectCanvasCompositions,
  readCanvasOrderV2,
  type CanvasObjectV2,
} from "@/canvas/canvas-document";
import {
  executeProductCanvasCommand,
  productCanvasMutationSchema,
  type ProductCanvasMutation,
} from "@/domain/canvas-command";

export type StagedCanvasObjectState = {
  object: CanvasObjectV2 | null;
  orderIndex: number | null;
};

export type StagedCanvasObjectChange = {
  objectId: string;
  beforeState: StagedCanvasObjectState;
  afterState: StagedCanvasObjectState;
  affectedFields: string[];
};

export type ValidatedCanvasProposal = {
  commands: ProductCanvasMutation[];
  affectedObjectIds: string[];
  commandTypes: ProductCanvasMutation["type"][];
  summary: string;
};

export type ValidatedCanvasReviewStage = ValidatedCanvasProposal & {
  objectChanges: StagedCanvasObjectChange[];
  tentativeUpdate: Uint8Array;
  visualObjects: CanvasObjectV2[];
};

export type ReviewObjectExplanation = {
  objectId: string;
  whatChanged: string;
  why: string;
};

function stateByObjectId(document: Y.Doc) {
  const order = readCanvasOrderV2(document);
  return new Map(
    projectCanvasCompositions(listCanvasObjectsV2(document)).map((object) => [
      object.id,
      {
        object,
        orderIndex: order.indexOf(object.id),
      } satisfies StagedCanvasObjectState,
    ]),
  );
}

function changedPaths(before: unknown, after: unknown, path: string): string[] {
  if (Object.is(before, after)) return [];
  if (path === "object.updatedAt") return [];
  if (
    before === null ||
    after === null ||
    typeof before !== "object" ||
    typeof after !== "object" ||
    Array.isArray(before) ||
    Array.isArray(after)
  ) {
    return [path];
  }
  const keys = new Set([
    ...Object.keys(before as Record<string, unknown>),
    ...Object.keys(after as Record<string, unknown>),
  ]);
  return [...keys].flatMap((key) =>
    changedPaths(
      (before as Record<string, unknown>)[key],
      (after as Record<string, unknown>)[key],
      path ? `${path}.${key}` : key,
    ),
  );
}

function simulateCanvasCommands(input: {
  document: Y.Doc;
  canvasId: string;
  actorId: string;
  commands: unknown[];
}) {
  const stateVector = Y.encodeStateVector(input.document);
  const beforeObjectsById = new Map(
    listCanvasObjectsV2(input.document).map((object) => [object.id, object]),
  );
  const beforeById = stateByObjectId(input.document);
  const proposalDocument = new Y.Doc();
  Y.applyUpdate(proposalDocument, Y.encodeStateAsUpdate(input.document));
  const commands = input.commands.map((command) =>
    productCanvasMutationSchema.parse(command),
  );
  const affectedObjectIds = new Set<string>();
  const lines = commands.map((command, index) => {
    const result = executeProductCanvasCommand(proposalDocument, {
      ...command,
      schemaVersion: 2,
      commandId: crypto.randomUUID(),
      canvasId: input.canvasId,
      actor: { id: input.actorId, type: "ai" },
      origin: "ai",
      issuedAt: new Date(index).toISOString(),
    });
    for (const objectId of result.affectedObjectIds) {
      affectedObjectIds.add(objectId);
    }
    return `${index + 1}. ${command.type} — affected ${result.affectedObjectIds.join(", ")}`;
  });
  const afterById = stateByObjectId(proposalDocument);
  const afterObjectsById = new Map(
    listCanvasObjectsV2(proposalDocument).map((object) => [object.id, object]),
  );
  const compositionAffectedObjectIds = new Set<string>();
  for (const objectId of affectedObjectIds) {
    const object =
      afterObjectsById.get(objectId) ?? beforeObjectsById.get(objectId);
    const compositionId =
      object?.type === "text" &&
      object.childRole === "shape-label" &&
      object.parentId
        ? object.parentId
        : objectId;
    if (beforeById.has(compositionId) || afterById.has(compositionId)) {
      compositionAffectedObjectIds.add(compositionId);
    }
  }
  const objectChanges = [...compositionAffectedObjectIds].map((objectId) => {
    const beforeState = beforeById.get(objectId) ?? {
      object: null,
      orderIndex: null,
    };
    const afterState = afterById.get(objectId) ?? {
      object: null,
      orderIndex: null,
    };
    const affectedFields = changedPaths(beforeState, afterState, "");
    if (!affectedFields.length) {
      throw new Error("A staged canvas command must change affected state.");
    }
    return { objectId, beforeState, afterState, affectedFields };
  });

  return {
    commands,
    affectedObjectIds: [...compositionAffectedObjectIds],
    commandTypes: commands.map((command) => command.type),
    lines,
    objectChanges,
    tentativeUpdate: Y.encodeStateAsUpdate(proposalDocument, stateVector),
    visualObjects: listCanvasObjectsV2(proposalDocument),
  };
}

export function validateCanvasProposal(input: {
  document: Y.Doc;
  canvasId: string;
  actorId: string;
  commands: unknown[];
}): ValidatedCanvasProposal {
  const plan = simulateCanvasCommands(input);

  return {
    commands: plan.commands,
    affectedObjectIds: plan.affectedObjectIds,
    commandTypes: plan.commandTypes,
    summary: `Proposed changes (not applied):\n${plan.lines.join("\n")}`,
  };
}

export function validateCanvasReviewStage(input: {
  document: Y.Doc;
  canvasId: string;
  actorId: string;
  commands: unknown[];
}): ValidatedCanvasReviewStage {
  const plan = simulateCanvasCommands(input);
  return {
    commands: plan.commands,
    affectedObjectIds: plan.affectedObjectIds,
    commandTypes: plan.commandTypes,
    objectChanges: plan.objectChanges,
    tentativeUpdate: plan.tentativeUpdate,
    visualObjects: plan.visualObjects,
    summary: `Prepared for tentative review:\n${plan.lines.join("\n")}\n${plan.objectChanges.length} object change${plan.objectChanges.length === 1 ? "" : "s"} will remain reviewable as one change set.`,
  };
}

export function validateCanvasReviewRefinement(input: {
  document: Y.Doc;
  canvasId: string;
  actorId: string;
  proposedCommands: unknown[];
  refinementCommands: unknown[];
}) {
  return validateCanvasReviewStage({
    document: input.document,
    canvasId: input.canvasId,
    actorId: input.actorId,
    commands: [...input.proposedCommands, ...input.refinementCommands],
  });
}

export function validateReviewExplanations(input: {
  reviewStage: ValidatedCanvasReviewStage;
  explanations: ReviewObjectExplanation[];
}) {
  const affectedIds = [...input.reviewStage.affectedObjectIds].sort();
  const explanationIds = input.explanations
    .map((explanation) => explanation.objectId)
    .sort();
  if (
    affectedIds.length !== explanationIds.length ||
    affectedIds.some((id, index) => id !== explanationIds[index])
  ) {
    throw new Error(
      "Review explanations must exactly match the affected canvas objects.",
    );
  }
  const byId = new Map(
    input.explanations.map((explanation) => [
      explanation.objectId,
      explanation,
    ]),
  );
  return input.reviewStage.objectChanges.map((change) => ({
    ...change,
    ...byId.get(change.objectId)!,
  }));
}
