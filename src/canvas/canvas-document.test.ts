import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  createProductCanvasDocument,
  listCanvasObjectsV2,
  migrateLegacyShapeLabels,
  projectCanvasCompositions,
  putCanvasObjectV2,
  readCanvasOrderV2,
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

function makeAnnotation(): Extract<CanvasObjectV2, { type: "annotation" }> {
  return {
    schemaVersion: 2,
    id: objectId,
    canvasId,
    createdBy: userId,
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
    type: "annotation",
    strokeVersion: 1,
    pointerType: "pen",
    ink: "highlighter",
    points: [5, 5, 25, 25],
    pressures: [0.2, 0.8],
    temporary: true,
    attachedObjectId: null,
    geometry: { x: 5, y: 15, width: 30, height: 30, rotation: 0 },
    style: {
      fill: null,
      outline: "#7c3aed",
      outlineWidth: 5,
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

  it("migrates embedded shape text into one stable first-class label child", () => {
    const document = createProductCanvasDocument(canvasId);
    putCanvasObjectV2(document, makeObject());

    expect(migrateLegacyShapeLabels(document)).toBe(1);
    expect(migrateLegacyShapeLabels(document)).toBe(0);

    const objects = listCanvasObjectsV2(document);
    const parent = objects.find((object) => object.id === objectId);
    const label = objects.find(
      (object) => object.type === "text" && object.childRole === "shape-label",
    );
    expect(parent).toMatchObject({ type: "shape", text: "" });
    expect(label).toMatchObject({
      type: "text",
      text: "Shared idea",
      parentId: objectId,
      childLayout: {
        horizontalConstraint: "left-right",
        verticalConstraint: "top-bottom",
      },
      geometry: { x: 52, y: 72, width: 156, height: 72, rotation: 0 },
    });
    expect(projectCanvasCompositions(objects)).toEqual([
      expect.objectContaining({
        id: objectId,
        type: "shape",
        text: "Shared idea",
      }),
    ]);
  });

  it("deduplicates a stable label order entry after concurrent migration", () => {
    const source = createProductCanvasDocument(canvasId);
    putCanvasObjectV2(source, makeObject());
    const initialUpdate = Y.encodeStateAsUpdate(source);
    const left = new Y.Doc();
    const right = new Y.Doc();
    Y.applyUpdate(left, initialUpdate);
    Y.applyUpdate(right, initialUpdate);

    migrateLegacyShapeLabels(left);
    migrateLegacyShapeLabels(right);
    Y.applyUpdate(left, Y.encodeStateAsUpdate(right));
    Y.applyUpdate(right, Y.encodeStateAsUpdate(left));

    expect(listCanvasObjectsV2(left)).toHaveLength(2);
    expect(listCanvasObjectsV2(right)).toHaveLength(2);
    expect(readCanvasOrderV2(left)).toHaveLength(2);
    expect(readCanvasOrderV2(right)).toHaveLength(2);
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

  it("round-trips canonical annotation samples through Yjs", () => {
    const source = createProductCanvasDocument(canvasId);
    putCanvasObjectV2(source, makeAnnotation());
    const restored = createProductCanvasDocument(canvasId);
    Y.applyUpdate(restored, Y.encodeStateAsUpdate(source));

    expect(readCanvasObjectV2(restored, objectId)).toEqual(makeAnnotation());
  });

  it("loads the bounded legacy annotation shape without inventing pressure", () => {
    const document = createProductCanvasDocument(canvasId);
    const legacy = structuredClone(makeAnnotation());
    delete legacy.pressures;
    delete legacy.pointerType;
    delete legacy.strokeVersion;
    delete legacy.ink;
    putCanvasObjectV2(document, legacy);

    expect(readCanvasObjectV2(document, objectId)).toMatchObject({
      type: "annotation",
      points: [5, 5, 25, 25],
      temporary: true,
      attachedObjectId: null,
    });
  });

  it("rejects incomplete annotation coordinates and pressure cardinality", () => {
    const document = createProductCanvasDocument(canvasId);
    expect(() =>
      putCanvasObjectV2(document, {
        ...makeAnnotation(),
        points: [5, 5, 25],
      }),
    ).toThrow("complete coordinate pairs");
    expect(() =>
      putCanvasObjectV2(document, {
        ...makeAnnotation(),
        pressures: [0.5],
      }),
    ).toThrow();
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

  it("lists valid objects while preserving an unrelated malformed shared entry", () => {
    const document = createProductCanvasDocument(canvasId);
    const malformedId = "50000000-0000-4000-8000-000000000099";
    const malformed = new Y.Map<unknown>();
    malformed.set("id", malformedId);
    document
      .getMap<Y.Map<unknown>>("canvas-objects-v2")
      .set(malformedId, malformed);
    document.getArray<string>("canvas-order-v2").push([malformedId]);
    putCanvasObjectV2(document, makeObject());

    expect(listCanvasObjectsV2(document)).toEqual([makeObject()]);
    expect(
      document.getMap<Y.Map<unknown>>("canvas-objects-v2").get(malformedId),
    ).toBe(malformed);
    expect(() => readCanvasObjectV2(document, malformedId)).toThrow();
  });

  it("reads retained rotated children whose unrotated dimensions cross a normalized edge", () => {
    const document = createProductCanvasDocument(canvasId);
    const parent = {
      ...makeObject(),
      text: "",
      geometry: { x: 0, y: 0, width: 200, height: 100, rotation: 0 },
    };
    const child: Extract<CanvasObjectV2, { type: "text" }> = {
      schemaVersion: 2,
      id: "50000000-0000-4000-8000-000000000002",
      canvasId,
      createdBy: userId,
      createdAt: "2026-08-11T00:00:00.000Z",
      updatedAt: "2026-08-11T00:00:00.000Z",
      type: "text",
      text: "Rotated child",
      parentId: parent.id,
      parentRelative: {
        x: 0.95,
        y: 0.1,
        width: 0.2,
        height: 0.2,
        rotation: 90,
      },
      childLayout: {
        horizontalConstraint: "left",
        verticalConstraint: "top",
      },
      geometry: { x: 190, y: 10, width: 40, height: 20, rotation: 90 },
      style: {
        fill: null,
        outline: "#334155",
        outlineWidth: 0,
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        fontSize: 16,
      },
    };

    putCanvasObjectV2(document, parent);
    expect(() => putCanvasObjectV2(document, child)).not.toThrow();
    expect(readCanvasObjectV2(document, child.id)).toMatchObject({
      parentId: parent.id,
      parentRelative: child.parentRelative,
      geometry: child.geometry,
    });
    expect(listCanvasObjectsV2(document)).toHaveLength(2);
  });

  it("keeps rejecting unrotated nested geometry outside normalized bounds", () => {
    const document = createProductCanvasDocument(canvasId);
    const child: Extract<CanvasObjectV2, { type: "text" }> = {
      schemaVersion: 2,
      id: "50000000-0000-4000-8000-000000000002",
      canvasId,
      createdBy: userId,
      createdAt: "2026-08-11T00:00:00.000Z",
      updatedAt: "2026-08-11T00:00:00.000Z",
      type: "text",
      text: "Outside child",
      parentId: objectId,
      parentRelative: { x: 0.95, y: 0.1, width: 0.2, height: 0.2 },
      childLayout: {
        horizontalConstraint: "left",
        verticalConstraint: "top",
      },
      geometry: { x: 190, y: 10, width: 40, height: 20, rotation: 0 },
      style: {
        fill: null,
        outline: "#334155",
        outlineWidth: 0,
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        fontSize: 16,
      },
    };

    expect(() => putCanvasObjectV2(document, child)).toThrow(
      "Nested object geometry must remain inside its parent.",
    );
  });

  it("tolerates insignificant retained transform drift at a normalized edge", () => {
    const document = createProductCanvasDocument(canvasId);
    const parent = { ...makeObject(), text: "" };
    const child: Extract<CanvasObjectV2, { type: "text" }> = {
      schemaVersion: 2,
      id: "50000000-0000-4000-8000-000000000002",
      canvasId,
      createdBy: userId,
      createdAt: "2026-08-11T00:00:00.000Z",
      updatedAt: "2026-08-11T00:00:00.000Z",
      type: "text",
      text: "Edge child",
      parentId: parent.id,
      parentRelative: {
        x: -Number.EPSILON,
        y: 0.25,
        width: 0.5,
        height: 0.5,
      },
      childLayout: {
        horizontalConstraint: "left",
        verticalConstraint: "top",
      },
      geometry: { x: 40, y: 84, width: 90, height: 48, rotation: 0 },
      style: {
        fill: null,
        outline: "#334155",
        outlineWidth: 0,
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        fontSize: 16,
      },
    };

    putCanvasObjectV2(document, parent);
    expect(() => putCanvasObjectV2(document, child)).not.toThrow();
    expect(readCanvasObjectV2(document, child.id)).toMatchObject({
      parentRelative: child.parentRelative,
    });
  });

  it("omits undefined optional fields when writing shared objects", () => {
    const document = createProductCanvasDocument(canvasId);
    const object: CanvasObjectV2 = {
      ...makeObject(),
      groupId: undefined,
    };

    expect(() => putCanvasObjectV2(document, object)).not.toThrow();
    expect(readCanvasObjectV2(document, object.id)).toEqual(makeObject());
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
