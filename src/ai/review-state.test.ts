import * as Y from "yjs";
import { describe, expect, it } from "vitest";

import {
  buildDiscardReviewUpdate,
  buildUndoAiChangeSetUpdate,
} from "@/ai/review-state";
import {
  createProductCanvasDocument,
  putCanvasObjectV2,
  readCanvasObjectV2,
  setCanvasObjectField,
} from "@/canvas/canvas-document";

const canvasId = "20000000-0000-4000-8000-000000000001";
const objectId = "61000000-0000-4000-8000-000000000001";

function object(
  x: number,
  text = "Evidence",
  updatedAt = "2026-08-26T00:00:00.000Z",
) {
  return {
    schemaVersion: 2 as const,
    id: objectId,
    canvasId,
    createdBy: "10000000-0000-4000-8000-000000000001",
    createdAt: "2026-08-26T00:00:00.000Z",
    updatedAt,
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
  it("undoes a multi-object AI turn as one update", () => {
    const document = createProductCanvasDocument(canvasId);
    const secondObjectId = "61000000-0000-4000-8000-000000000002";
    const first = object(240);
    const second = { ...object(480), id: secondObjectId, text: "Second" };
    putCanvasObjectV2(document, first);
    putCanvasObjectV2(document, second);

    const undo = buildUndoAiChangeSetUpdate({
      document,
      objectChanges: [
        {
          id: "71000000-0000-4000-8000-000000000010",
          objectId,
          beforeState: { object: null, orderIndex: null },
          afterState: { object: first, orderIndex: 0 },
          affectedFields: ["object", "orderIndex"],
        },
        {
          id: "71000000-0000-4000-8000-000000000011",
          objectId: secondObjectId,
          beforeState: { object: null, orderIndex: null },
          afterState: { object: second, orderIndex: 1 },
          affectedFields: ["object", "orderIndex"],
        },
      ],
    });

    Y.applyUpdate(document, undo.update);
    expect(readCanvasObjectV2(document, objectId)).toBeUndefined();
    expect(readCanvasObjectV2(document, secondObjectId)).toBeUndefined();
    expect(undo.conflicts).toEqual([]);
  });

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
      affectedFields: ["object.geometry.x"],
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
      affectedFields: ["object.geometry.x"],
    });
    expect(decision.status).toBe("partial");
    expect(decision.conflicts).toContain(`${objectId}:geometry.x`);
  });

  it("ignores unrelated geometry and updated metadata when discarding an AI label", () => {
    const document = createProductCanvasDocument(canvasId);
    putCanvasObjectV2(
      document,
      object(241, "Supporting evidence", "2026-08-26T00:02:00.000Z"),
    );
    const decision = buildDiscardReviewUpdate({
      document,
      objectChangeId: "71000000-0000-4000-8000-000000000002",
      objectId,
      beforeState: { object: object(240, "New idea"), orderIndex: 0 },
      afterState: {
        object: object(240, "Supporting evidence", "2026-08-26T00:01:00.000Z"),
        orderIndex: 0,
      },
      affectedFields: ["object.text"],
    });
    Y.applyUpdate(document, decision.update);
    expect(readCanvasObjectV2(document, objectId)).toMatchObject({
      text: "New idea",
      geometry: { x: 241 },
      updatedAt: "2026-08-26T00:02:00.000Z",
    });
    expect(decision).toMatchObject({ status: "applied", conflicts: [] });
  });

  it("removes an unchanged AI-created object and restores its prior order", () => {
    const document = createProductCanvasDocument(canvasId);
    putCanvasObjectV2(document, object(240));
    const decision = buildDiscardReviewUpdate({
      document,
      objectChangeId: "71000000-0000-4000-8000-000000000003",
      objectId,
      beforeState: { object: null, orderIndex: null },
      afterState: { object: object(240), orderIndex: 0 },
      affectedFields: ["object", "orderIndex"],
    });
    Y.applyUpdate(document, decision.update);
    expect(readCanvasObjectV2(document, objectId)).toBeUndefined();
    expect(decision).toMatchObject({ status: "applied", conflicts: [] });
  });

  it("restores an AI-deleted object at its prior order position", () => {
    const document = createProductCanvasDocument(canvasId);
    const decision = buildDiscardReviewUpdate({
      document,
      objectChangeId: "71000000-0000-4000-8000-000000000004",
      objectId,
      beforeState: { object: object(240), orderIndex: 0 },
      afterState: { object: null, orderIndex: null },
      affectedFields: ["object", "orderIndex"],
    });
    Y.applyUpdate(document, decision.update);
    expect(readCanvasObjectV2(document, objectId)).toMatchObject({
      id: objectId,
      text: "Evidence",
    });
    expect(decision).toMatchObject({ status: "applied", conflicts: [] });
  });

  it("preserves a human-modified AI-created object and reports the collision", () => {
    const document = createProductCanvasDocument(canvasId);
    putCanvasObjectV2(document, object(240, "Human adopted this object"));
    const decision = buildDiscardReviewUpdate({
      document,
      objectChangeId: "71000000-0000-4000-8000-000000000005",
      objectId,
      beforeState: { object: null, orderIndex: null },
      afterState: { object: object(240), orderIndex: 0 },
      affectedFields: ["object", "orderIndex"],
    });
    expect(decision.conflicts).toContain(`${objectId}:changed`);
    expect(readCanvasObjectV2(document, objectId)).toMatchObject({
      text: "Human adopted this object",
    });
  });
});
