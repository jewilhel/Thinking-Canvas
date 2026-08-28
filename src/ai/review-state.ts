import * as Y from "yjs";
import { z } from "zod";

import type { StagedCanvasObjectState } from "@/ai/proposals";
import {
  canvasObjectV2Schema,
  createProductCanvasDocument,
  readCanvasOrderV2,
} from "@/canvas/canvas-document";
import {
  applyCanvasHistoryEntry,
  type CanvasHistoryEntry,
} from "@/canvas/canvas-history";
const stagedStateSchema = z.strictObject({
  object: canvasObjectV2Schema.nullable(),
  orderIndex: z.number().int().nonnegative().nullable(),
});

function placeObject(
  order: string[],
  objectId: string,
  state: StagedCanvasObjectState,
) {
  const next = order.filter((id) => id !== objectId);
  if (!state.object) return next;
  const index = Math.min(state.orderIndex ?? next.length, next.length);
  next.splice(index, 0, objectId);
  return next;
}

function readObjectPath(value: unknown, path: string[]) {
  let current = value;
  for (const segment of path) {
    if (
      typeof current !== "object" ||
      current === null ||
      Array.isArray(current)
    )
      return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function writeObjectPath(
  value: Record<string, unknown>,
  path: string[],
  replacement: unknown,
) {
  let current = value;
  for (const segment of path.slice(0, -1)) {
    const child = current[segment];
    if (typeof child !== "object" || child === null || Array.isArray(child)) {
      throw new Error("A review affected-field path is invalid.");
    }
    current = child as Record<string, unknown>;
  }
  const leaf = path.at(-1);
  if (!leaf) throw new Error("A review affected-field path is empty.");
  current[leaf] = structuredClone(replacement);
}

function isolateAffectedObjectState(
  beforeState: StagedCanvasObjectState,
  afterState: StagedCanvasObjectState,
  affectedFields: string[],
) {
  if (!beforeState.object || !afterState.object) return beforeState.object;
  const desired = structuredClone(afterState.object) as unknown as Record<
    string,
    unknown
  >;
  for (const field of affectedFields) {
    if (!field.startsWith("object.")) continue;
    const path = field.slice("object.".length).split(".");
    writeObjectPath(desired, path, readObjectPath(beforeState.object, path));
  }
  return canvasObjectV2Schema.parse(desired);
}

export function buildDiscardReviewUpdate(input: {
  document: Y.Doc;
  objectChangeId: string;
  objectId: string;
  beforeState: unknown;
  afterState: unknown;
  affectedFields: string[];
}) {
  const beforeState = stagedStateSchema.parse(input.beforeState);
  const afterState = stagedStateSchema.parse(input.afterState);
  const stateVector = Y.encodeStateVector(input.document);
  const canvasId = beforeState.object?.canvasId ?? afterState.object?.canvasId;
  if (!canvasId) throw new Error("A review change must belong to a canvas.");
  const nextDocument = createProductCanvasDocument(canvasId);
  Y.applyUpdate(nextDocument, Y.encodeStateAsUpdate(input.document));
  const currentOrder = readCanvasOrderV2(nextDocument);
  const entry: CanvasHistoryEntry = {
    commandId: input.objectChangeId,
    actorId: "primary-ai",
    beforeObjects: {
      [input.objectId]: isolateAffectedObjectState(
        beforeState,
        afterState,
        input.affectedFields,
      ),
    },
    afterObjects: { [input.objectId]: afterState.object },
    beforeOrder: placeObject(currentOrder, input.objectId, beforeState),
    afterOrder: placeObject(currentOrder, input.objectId, afterState),
  };
  const result = applyCanvasHistoryEntry(nextDocument, entry, "undo");
  const update = Y.encodeStateAsUpdate(nextDocument, stateVector);
  return { ...result, update };
}

export function buildUndoAiChangeSetUpdate(input: {
  document: Y.Doc;
  objectChanges: Array<{
    id: string;
    objectId: string;
    beforeState: unknown;
    afterState: unknown;
    affectedFields: string[];
  }>;
}) {
  const stateVector = Y.encodeStateVector(input.document);
  const canvasId = input.objectChanges
    .map(
      (change) => stagedStateSchema.parse(change.afterState).object?.canvasId,
    )
    .find(Boolean);
  const fallbackCanvasId = input.objectChanges
    .map(
      (change) => stagedStateSchema.parse(change.beforeState).object?.canvasId,
    )
    .find(Boolean);
  if (!canvasId && !fallbackCanvasId) {
    throw new Error("An AI change set must belong to a canvas.");
  }
  const nextDocument = createProductCanvasDocument(
    canvasId ?? fallbackCanvasId!,
  );
  Y.applyUpdate(nextDocument, Y.encodeStateAsUpdate(input.document));
  const conflicts: string[] = [];

  for (const change of [...input.objectChanges].reverse()) {
    const result = buildDiscardReviewUpdate({
      document: nextDocument,
      objectChangeId: change.id,
      objectId: change.objectId,
      beforeState: change.beforeState,
      afterState: change.afterState,
      affectedFields: change.affectedFields,
    });
    Y.applyUpdate(nextDocument, result.update);
    conflicts.push(...result.conflicts);
  }

  return {
    update: Y.encodeStateAsUpdate(nextDocument, stateVector),
    conflicts: [...new Set(conflicts)],
  };
}
