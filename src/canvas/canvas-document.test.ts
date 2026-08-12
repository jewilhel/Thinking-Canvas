import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  createProductCanvasDocument,
  listCanvasObjectsV2,
  putCanvasObjectV2,
  readCanvasDocumentMetadata,
  readCanvasObjectV2,
  setCanvasObjectField,
  upgradeCanvasDocumentV1,
  type CanvasObjectV2,
} from "@/canvas/canvas-document";
import { putCanvasObject } from "@/collaboration/canvas-document";

const canvasId = "20000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000001";
const objectId = "50000000-0000-4000-8000-000000000001";

function makeObject(): Extract<CanvasObjectV2, { type: "shape" }> {
  return {
    schemaVersion: 2,
    id: objectId,
    canvasId,
    createdBy: userId,
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
    type: "shape",
    shape: "rectangle",
    text: "Shared idea",
    geometry: { x: 40, y: 60, width: 180, height: 96, rotation: 0 },
    style: {
      fill: "#ffffff",
      outline: "#334155",
      outlineWidth: 2,
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      fontSize: 16,
    },
  };
}

describe("production canvas document", () => {
  it("initializes an empty versioned document", () => {
    const document = createProductCanvasDocument(canvasId);

    expect(readCanvasDocumentMetadata(document)).toEqual({
      schemaVersion: 2,
      canvasId,
    });
    expect(listCanvasObjectsV2(document)).toEqual([]);
  });

  it("upgrades a legacy object without changing its identity or geometry", () => {
    const document = new Y.Doc();
    putCanvasObject(document, {
      schemaVersion: 1,
      id: objectId,
      canvasId,
      createdBy: userId,
      createdAt: "2026-08-11T00:00:00.000Z",
      updatedAt: "2026-08-11T00:00:00.000Z",
      type: "shape",
      shape: "ellipse",
      text: "Legacy idea",
      geometry: { x: 20, y: 30, width: 140, height: 80, rotation: 4 },
    });

    expect(upgradeCanvasDocumentV1(document, canvasId)).toBe(true);
    expect(upgradeCanvasDocumentV1(document, canvasId)).toBe(false);
    expect(readCanvasObjectV2(document, objectId)).toMatchObject({
      schemaVersion: 2,
      id: objectId,
      canvasId,
      type: "shape",
      shape: "ellipse",
      text: "Legacy idea",
      geometry: { x: 20, y: 30, width: 140, height: 80, rotation: 4 },
    });
  });

  it("merges concurrent edits to separate object fields", () => {
    const source = createProductCanvasDocument(canvasId);
    putCanvasObjectV2(source, makeObject());
    const baseUpdate = Y.encodeStateAsUpdate(source);

    const geometryPeer = new Y.Doc();
    const textPeer = new Y.Doc();
    Y.applyUpdate(geometryPeer, baseUpdate);
    Y.applyUpdate(textPeer, baseUpdate);
    const baseVector = Y.encodeStateVector(source);

    setCanvasObjectField(geometryPeer, objectId, ["geometry", "x"], 220);
    setCanvasObjectField(textPeer, objectId, ["text"], "Concurrent label");

    const merged = new Y.Doc();
    Y.applyUpdate(merged, baseUpdate);
    Y.applyUpdate(merged, Y.encodeStateAsUpdate(geometryPeer, baseVector));
    Y.applyUpdate(merged, Y.encodeStateAsUpdate(textPeer, baseVector));

    expect(readCanvasObjectV2(merged, objectId)).toMatchObject({
      text: "Concurrent label",
      geometry: { x: 220, y: 60 },
    });
  });

  it("updates an existing field-level object without duplicating its order", () => {
    const document = createProductCanvasDocument(canvasId);
    putCanvasObjectV2(document, makeObject());
    putCanvasObjectV2(document, { ...makeObject(), text: "Updated idea" });

    expect(listCanvasObjectsV2(document)).toHaveLength(1);
    expect(readCanvasObjectV2(document, objectId)).toMatchObject({
      type: "shape",
      text: "Updated idea",
    });
  });

  it("rejects documents and objects from another canvas", () => {
    const document = createProductCanvasDocument(canvasId);

    expect(() =>
      putCanvasObjectV2(document, {
        ...makeObject(),
        canvasId: "20000000-0000-4000-8000-000000000099",
      }),
    ).toThrow("Canvas object identity does not match its document.");

    expect(() =>
      upgradeCanvasDocumentV1(document, "20000000-0000-4000-8000-000000000099"),
    ).toThrow("Canvas document identity does not match its route.");
  });
});
