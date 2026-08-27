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

export function buildDiscardReviewUpdate(input: {
  document: Y.Doc;
  objectChangeId: string;
  objectId: string;
  beforeState: unknown;
  afterState: unknown;
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
    beforeObjects: { [input.objectId]: beforeState.object },
    afterObjects: { [input.objectId]: afterState.object },
    beforeOrder: placeObject(currentOrder, input.objectId, beforeState),
    afterOrder: placeObject(currentOrder, input.objectId, afterState),
  };
  const result = applyCanvasHistoryEntry(nextDocument, entry, "undo");
  const update = Y.encodeStateAsUpdate(nextDocument, stateVector);
  return { ...result, update };
}
