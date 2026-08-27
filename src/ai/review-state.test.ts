import * as Y from "yjs";
import { describe, expect, it } from "vitest";

import { buildDiscardReviewUpdate } from "@/ai/review-state";
import {
  createProductCanvasDocument,
  putCanvasObjectV2,
  readCanvasObjectV2,
  setCanvasObjectField,
} from "@/canvas/canvas-document";

const canvasId = "20000000-0000-4000-8000-000000000001";
const objectId = "61000000-0000-4000-8000-000000000001";

function object(x: number, text = "Evidence") {
  return {
    schemaVersion: 2 as const,
    id: objectId,
    canvasId,
    createdBy: "10000000-0000-4000-8000-000000000001",
    createdAt: "2026-08-26T00:00:00.000Z",
    updatedAt: "2026-08-26T00:00:00.000Z",
    type: "shape" as const,
    shape: "rectangle" as const,
    text,
    geometry: { x, y: 0, width: 160, height: 96, rotation: 0 },
    style: {
      fill: "#ffffff",
      outline: "#334155",
      outlineWidth: 2,
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      fontSize: 16,
    },
  };
}

describe("review decision state", () => {
  it("discards the AI field while preserving a later collaborator field", () => {
    const document = createProductCanvasDocument(canvasId);
    putCanvasObjectV2(document, object(240));
    setCanvasObjectField(document, objectId, ["text"], "Human clarification");
    const decision = buildDiscardReviewUpdate({
      document,
      objectChangeId: "71000000-0000-4000-8000-000000000001",
      objectId,
      beforeState: { object: object(0), orderIndex: 0 },
      afterState: { object: object(240), orderIndex: 0 },
    });
    Y.applyUpdate(document, decision.update);
    expect(readCanvasObjectV2(document, objectId)).toMatchObject({
      text: "Human clarification",
      geometry: { x: 0 },
    });
    expect(decision).toMatchObject({ status: "applied", conflicts: [] });
  });

  it("does not overwrite a later collaborator edit to the same field", () => {
    const document = createProductCanvasDocument(canvasId);
    putCanvasObjectV2(document, object(320));
    const decision = buildDiscardReviewUpdate({
      document,
      objectChangeId: "71000000-0000-4000-8000-000000000001",
      objectId,
      beforeState: { object: object(0), orderIndex: 0 },
      afterState: { object: object(240), orderIndex: 0 },
    });
    expect(decision.status).toBe("partial");
    expect(decision.conflicts).toContain(`${objectId}:geometry.x`);
  });
});
