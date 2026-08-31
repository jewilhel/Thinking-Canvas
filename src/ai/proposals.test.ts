import * as Y from "yjs";
import { describe, expect, it } from "vitest";

import {
  validateCanvasProposal,
  validateCanvasReviewRefinement,
  validateCanvasReviewStage,
  validateReviewExplanations,
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
    expect(review.summary).toContain("Prepared for tentative review");
    const tentativeDocument = new Y.Doc();
    Y.applyUpdate(tentativeDocument, before);
    Y.applyUpdate(tentativeDocument, review.tentativeUpdate);
    expect(listCanvasObjectsV2(tentativeDocument)[0]?.geometry).toMatchObject({
      x: 240,
      y: 180,
    });
    expect(
      validateReviewExplanations({
        reviewStage: review,
        explanations: [
          {
            objectId,
            whatChanged: "Moved the evidence card to the review area.",
            why: "The new position separates evidence from assumptions.",
          },
        ],
      })[0],
    ).toMatchObject({
      objectId,
      whatChanged: "Moved the evidence card to the review area.",
      why: "The new position separates evidence from assumptions.",
    });
    expect(() =>
      validateReviewExplanations({
        reviewStage: review,
        explanations: [
          {
            objectId: "61000000-0000-4000-8000-000000000099",
            whatChanged: "Changed another object.",
            why: "This must not be accepted.",
          },
        ],
      }),
    ).toThrow("exactly match");
    expect(Y.encodeStateAsUpdate(document)).toEqual(before);
  });

  it("rejects nonexistent or cross-canvas review targets without staging", () => {
    const document = createProductCanvasDocument(canvasId);
    expect(() =>
      validateCanvasReviewStage({
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

  it("lets the AI style, move, resize, and delete canonical annotations", () => {
    const document = createProductCanvasDocument(canvasId);
    putCanvasObjectV2(document, {
      schemaVersion: 2,
      id: objectId,
      canvasId,
      createdBy: actorId,
      createdAt: "2026-08-24T00:00:00.000Z",
      updatedAt: "2026-08-24T00:00:00.000Z",
      type: "annotation",
      strokeVersion: 1,
      pointerType: "pen",
      points: [4, 4, 84, 44],
      pressures: [0.4, 0.8],
      baseWidth: 88,
      baseHeight: 48,
      temporary: true,
      attachedObjectId: null,
      attachmentOffset: null,
      geometry: { x: 96, y: 96, width: 88, height: 48, rotation: 0 },
      style: {
        fill: null,
        outline: "#334155",
        outlineWidth: 4,
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        fontSize: 16,
      },
    });

    const edit = validateCanvasReviewStage({
      document,
      canvasId,
      actorId,
      commands: [
        {
          type: "object.style",
          payload: {
            objectId,
            style: { outline: "#7c3aed", outlineWidth: 8 },
          },
        },
        {
          type: "object.move",
          payload: { objectId, x: 240, y: 180 },
        },
        {
          type: "object.resize",
          payload: { objectId, width: 176, height: 96 },
        },
      ],
    });
    expect(edit.objectChanges[0]?.afterState.object).toMatchObject({
      type: "annotation",
      geometry: { x: 240, y: 180, width: 176, height: 96 },
      style: { outline: "#7c3aed", outlineWidth: 8 },
    });
    expect(listCanvasObjectsV2(document)).toHaveLength(1);

    const deletion = validateCanvasReviewStage({
      document,
      canvasId,
      actorId,
      commands: [{ type: "object.delete", payload: { objectId } }],
    });
    expect(deletion.objectChanges[0]).toMatchObject({
      objectId,
      beforeState: { object: { type: "annotation" } },
      afterState: { object: null },
    });
    expect(listCanvasObjectsV2(document)).toHaveLength(1);
  });

  it("layers visual adjustments after newly proposed objects exist", () => {
    const document = createProductCanvasDocument(canvasId);
    const createdId = "61000000-0000-4000-8000-000000000002";
    const review = validateCanvasReviewRefinement({
      document,
      canvasId,
      actorId,
      proposedCommands: [
        {
          type: "object.create",
          payload: {
            object: {
              schemaVersion: 2,
              id: createdId,
              canvasId,
              createdBy: actorId,
              createdAt: "2026-08-26T00:00:00.000Z",
              updatedAt: "2026-08-26T00:00:00.000Z",
              type: "shape",
              shape: "rectangle",
              text: "Blue",
              geometry: {
                x: 100,
                y: 100,
                width: 160,
                height: 96,
                rotation: 0,
              },
              style: {
                fill: "#bfdbfe",
                outline: "#1e3a8a",
                outlineWidth: 2,
                fontFamily: "Inter, sans-serif",
                fontSize: 16,
                textColor: "#172554",
              },
            },
          },
        },
      ],
      refinementCommands: [
        {
          type: "object.move",
          payload: { objectId: createdId, x: 140, y: 120 },
        },
        {
          type: "object.resize",
          payload: { objectId: createdId, width: 200, height: 120 },
        },
      ],
    });

    expect(review).toMatchObject({
      affectedObjectIds: [createdId],
      commandTypes: ["object.create", "object.move", "object.resize"],
      objectChanges: [
        {
          objectId: createdId,
          beforeState: { object: null },
          afterState: {
            object: {
              geometry: { x: 140, y: 120, width: 200, height: 120 },
            },
          },
        },
      ],
    });
    expect(listCanvasObjectsV2(document)).toEqual([]);
  });
});
