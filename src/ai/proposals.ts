import * as Y from "yjs";

import {
  listCanvasObjectsV2,
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
};

function stateByObjectId(document: Y.Doc) {
  const order = readCanvasOrderV2(document);
  return new Map(
    listCanvasObjectsV2(document).map((object) => [
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
  const objectChanges = [...affectedObjectIds].map((objectId) => {
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
    affectedObjectIds: [...affectedObjectIds],
    commandTypes: commands.map((command) => command.type),
    lines,
    objectChanges,
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
    summary: `Staged for review (canvas unchanged):\n${plan.lines.join("\n")}\n${plan.objectChanges.length} object change${plan.objectChanges.length === 1 ? "" : "s"} staged for later review.`,
  };
}
