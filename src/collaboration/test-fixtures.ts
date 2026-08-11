import * as Y from "yjs";

import type { CanvasObject } from "@/domain/canvas-object";

const canvasId = "20000000-0000-4000-8000-000000000001";
const actorId = "10000000-0000-4000-8000-000000000001";

export function shape(id: string, text: string): CanvasObject {
  return {
    schemaVersion: 1,
    id,
    canvasId,
    createdBy: actorId,
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
    type: "shape",
    shape: "rectangle",
    text,
    geometry: { x: 0, y: 0, width: 120, height: 80, rotation: 0 },
  };
}

export function captureUpdate(document: Y.Doc, mutate: () => void) {
  const vector = Y.encodeStateVector(document);
  mutate();
  return Y.encodeStateAsUpdate(document, vector);
}
