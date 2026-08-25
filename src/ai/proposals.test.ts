import * as Y from "yjs";
import { describe, expect, it } from "vitest";

import {
  validateCanvasProposal,
  validateCanvasReviewStage,
} from "@/ai/proposals";
import {
  createProductCanvasDocument,
  listCanvasObjectsV2,
  putCanvasObjectV2,
} from "@/canvas/canvas-document";

const canvasId = "20000000-0000-4000-8000-000000000001";
const actorId = "10000000-0000-4000-8000-000000000001";
const objectId = "61000000-0000-4000-8000-000000000001";

describe("validated canvas proposals", () => {
  it("validates commands against a clone without changing canonical state", () => {
    const document = createProductCanvasDocument(canvasId);
    putCanvasObjectV2(document, {
      schemaVersion: 2,
      id: objectId,
      canvasId,
      createdBy: actorId,
      createdAt: "2026-08-24T00:00:00.000Z",
      updatedAt: "2026-08-24T00:00:00.000Z",
      type: "shape",
      shape: "rectangle",
      text: "Evidence",
      geometry: { x: 0, y: 0, width: 160, height: 96, rotation: 0 },
      style: {
        fill: "#ffffff",
        outline: "#334155",
        outlineWidth: 2,
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        fontSize: 16,
      },
    });
    const before = Y.encodeStateAsUpdate(document);

    const proposal = validateCanvasProposal({
      document,
      canvasId,
      actorId,
      commands: [
        {
          type: "object.move",
          payload: { objectId, x: 240, y: 180 },
        },
      ],
    });

    expect(proposal).toMatchObject({
      commandTypes: ["object.move"],
      affectedObjectIds: [objectId],
    });
    expect(proposal.summary).toContain("Proposed changes (not applied)");
    expect(Y.encodeStateAsUpdate(document)).toEqual(before);
    expect(listCanvasObjectsV2(document)[0]?.geometry.x).not.toBe(240);
  });

  it("rejects nonexistent targets through the product command invariant", () => {
    const document = createProductCanvasDocument(canvasId);
    expect(() =>
      validateCanvasProposal({
        document,
        canvasId,
        actorId,
        commands: [
          {
            type: "object.move",
            payload: { objectId, x: 240, y: 180 },
          },
        ],
      }),
    ).toThrow("The target object does not exist");
  });

  it("builds review before/after records without changing canonical state", () => {
    const document = createProductCanvasDocument(canvasId);
    putCanvasObjectV2(document, {
      schemaVersion: 2,
      id: objectId,
      canvasId,
      createdBy: actorId,
      createdAt: "2026-08-24T00:00:00.000Z",
      updatedAt: "2026-08-24T00:00:00.000Z",
      type: "shape",
      shape: "rectangle",
      text: "Evidence",
      geometry: { x: 0, y: 0, width: 160, height: 96, rotation: 0 },
      style: {
        fill: "#ffffff",
        outline: "#334155",
        outlineWidth: 2,
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        fontSize: 16,
      },
    });
    const before = Y.encodeStateAsUpdate(document);

    const review = validateCanvasReviewStage({
      document,
      canvasId,
      actorId,
      commands: [
        {
          type: "object.move",
          payload: { objectId, x: 240, y: 180 },
        },
      ],
    });

    expect(review).toMatchObject({
      commandTypes: ["object.move"],
      affectedObjectIds: [objectId],
      objectChanges: [
        {
          objectId,
          beforeState: { object: { geometry: { x: 0, y: 0 } } },
          afterState: { object: { geometry: { x: 240, y: 180 } } },
          affectedFields: ["object.geometry.x", "object.geometry.y"],
        },
      ],
    });
    expect(review.summary).toContain("Staged for review (canvas unchanged)");
    expect(Y.encodeStateAsUpdate(document)).toEqual(before);
  });
});
