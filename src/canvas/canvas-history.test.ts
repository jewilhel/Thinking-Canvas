import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  createProductCanvasDocument,
  listCanvasObjectsV2,
  putCanvasObjectV2,
  readCanvasGroupV2,
  readCanvasObjectV2,
  readCanvasOrderV2,
  type CanvasObjectV2,
} from "@/canvas/canvas-document";
import {
  applyCanvasHistoryEntry,
  executeProductCanvasCommandWithHistory,
} from "@/canvas/canvas-history";
import { executeProductCanvasCommand } from "@/domain/canvas-command";
import {
  createProductDocumentObject,
  getProductDocumentContentRoot,
} from "@/documents/product-document";

const canvasId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const objectId = "33333333-3333-4333-8333-333333333333";
const annotationId = "33333333-3333-4333-8333-333333333334";
const now = "2026-08-11T20:00:00.000Z";

function shape(id = objectId): CanvasObjectV2 {
  return {
    schemaVersion: 2,
    id,
    canvasId,
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
    groupId: null,
    type: "shape",
    shape: "rectangle",
    text: "Original",
    geometry: { x: 20, y: 40, width: 160, height: 90, rotation: 0 },
    style: {
      fill: "#ffffff",
      outline: "#334155",
      outlineWidth: 2,
      fontFamily: "Inter, sans-serif",
      fontSize: 16,
    },
  };
}

function annotation(
  id = objectId,
): Extract<CanvasObjectV2, { type: "annotation" }> {
  return {
    schemaVersion: 2,
    id,
    canvasId,
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
    groupId: null,
    type: "annotation",
    strokeVersion: 1,
    pointerType: "pen",
    points: [5, 5, 25, 25],
    pressures: [0.2, 0.8],
    temporary: true,
    attachedObjectId: null,
    geometry: { x: 5, y: 15, width: 30, height: 30, rotation: 0 },
    style: {
      fill: null,
      outline: "#7c3aed",
      outlineWidth: 5,
      fontFamily: "Inter, sans-serif",
      fontSize: 16,
    },
  };
}

function icon(): Extract<CanvasObjectV2, { type: "icon" }> {
  return {
    schemaVersion: 2,
    id: "44444444-4444-4444-8444-444444444444",
    canvasId,
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
    groupId: null,
    type: "icon",
    catalog: "phosphor",
    catalogVersion: "2.1.1",
    iconName: "brain",
    iconVariant: "fill",
    parentId: null,
    parentRelative: null,
    geometry: { x: 60, y: 60, width: 40, height: 30, rotation: 0 },
    style: {
      fill: "#7c3aed",
      outline: "#312e81",
      outlineWidth: 2,
      fontFamily: "Inter, sans-serif",
      fontSize: 16,
    },
  };
}

function command(type: string, payload: unknown, issuedAt = now) {
  return {
    schemaVersion: 2,
    commandId: crypto.randomUUID(),
    canvasId,
    actor: { id: actorId, type: "human" },
    origin: "human",
    issuedAt,
    type,
    payload,
  };
}

describe("actor-local canvas history", () => {
  it("undoes and redoes document title and presentation settings", () => {
    const document = createProductCanvasDocument(canvasId);
    const productDocument = createProductDocumentObject({
      canvasId,
      objectId,
      actorId,
      issuedAt: now,
      title: "Original document",
      geometry: { x: 20, y: 40, width: 480, height: 640, rotation: 0 },
    });
    putCanvasObjectV2(document, productDocument);
    const { history } = executeProductCanvasCommandWithHistory(
      document,
      command("document.update", {
        objectId,
        title: "Updated document",
        settings: {
          ...productDocument.settings,
          displayFont: "serif",
          readingSize: "large",
        },
      }),
    );

    expect(readCanvasObjectV2(document, objectId)).toMatchObject({
      title: "Updated document",
      settings: { displayFont: "serif", readingSize: "large" },
    });
    expect(applyCanvasHistoryEntry(document, history, "undo").status).toBe(
      "applied",
    );
    expect(readCanvasObjectV2(document, objectId)).toMatchObject({
      title: "Original document",
      settings: { displayFont: "sans", readingSize: "comfortable" },
    });
    expect(applyCanvasHistoryEntry(document, history, "redo")).toEqual({
      status: "applied",
      conflicts: [],
    });
    expect(readCanvasObjectV2(document, objectId)).toMatchObject({
      title: "Updated document",
      settings: { displayFont: "serif", readingSize: "large" },
    });
  });

  it("restores a deleted document with its durable content namespace", () => {
    const document = createProductCanvasDocument(canvasId);
    const productDocument = createProductDocumentObject({
      canvasId,
      objectId,
      actorId,
      issuedAt: now,
      title: "Durable document",
      geometry: { x: 20, y: 40, width: 480, height: 640, rotation: 0 },
    });
    putCanvasObjectV2(document, productDocument);
    getProductDocumentContentRoot(document, productDocument.documentId).insert(
      0,
      "Keep this body",
    );
    const { history } = executeProductCanvasCommandWithHistory(
      document,
      command("object.delete", { objectId }),
    );
    expect(readCanvasObjectV2(document, objectId)).toBeUndefined();

    expect(applyCanvasHistoryEntry(document, history, "undo").status).toBe(
      "applied",
    );
    expect(readCanvasObjectV2(document, objectId)?.type).toBe("document");
    expect(
      getProductDocumentContentRoot(
        document,
        productDocument.documentId,
      ).toString(),
    ).toBe("Keep this body");
    expect(readCanvasObjectV2(document, objectId)).toEqual(
      history.beforeObjects[objectId],
    );

    expect(applyCanvasHistoryEntry(document, history, "redo")).toEqual({
      status: "applied",
      conflicts: [],
    });
    expect(readCanvasObjectV2(document, objectId)).toBeUndefined();
  });

  it("undoes and redoes a complete icon parent relationship", () => {
    const document = createProductCanvasDocument(canvasId);
    putCanvasObjectV2(document, shape());
    putCanvasObjectV2(document, icon());
    const { history } = executeProductCanvasCommandWithHistory(
      document,
      command("icon.nest", {
        objectId: icon().id,
        parentId: objectId,
      }),
    );

    expect(readCanvasObjectV2(document, icon().id)).toMatchObject({
      parentId: objectId,
    });
    expect(applyCanvasHistoryEntry(document, history, "undo").status).toBe(
      "applied",
    );
    expect(readCanvasObjectV2(document, icon().id)).toMatchObject({
      parentId: null,
      parentRelative: null,
    });
    expect(applyCanvasHistoryEntry(document, history, "redo").status).toBe(
      "applied",
    );
    expect(readCanvasObjectV2(document, icon().id)).toMatchObject({
      parentId: objectId,
      parentRelative: { x: 0.25, width: 0.25 },
    });
  });
  it("undoes and redoes object creation", () => {
    const document = createProductCanvasDocument(canvasId);
    const { history } = executeProductCanvasCommandWithHistory(
      document,
      command("object.create", { object: shape() }),
    );

    expect(applyCanvasHistoryEntry(document, history, "undo").status).toBe(
      "applied",
    );
    expect(readCanvasObjectV2(document, objectId)).toBeUndefined();
    expect(applyCanvasHistoryEntry(document, history, "redo").status).toBe(
      "applied",
    );
    expect(readCanvasObjectV2(document, objectId)).toMatchObject({
      text: "Original",
    });
  });

  it("undoes and redoes one complete canonical annotation", () => {
    const document = createProductCanvasDocument(canvasId);
    const { history } = executeProductCanvasCommandWithHistory(
      document,
      command("object.create", { object: annotation() }),
    );

    expect(applyCanvasHistoryEntry(document, history, "undo").status).toBe(
      "applied",
    );
    expect(readCanvasObjectV2(document, objectId)).toBeUndefined();
    expect(applyCanvasHistoryEntry(document, history, "redo").status).toBe(
      "applied",
    );
    expect(readCanvasObjectV2(document, objectId)).toEqual(annotation());
  });

  it("undoes and redoes a flip added to legacy geometry", () => {
    const document = createProductCanvasDocument(canvasId);
    putCanvasObjectV2(document, shape());
    const { history } = executeProductCanvasCommandWithHistory(
      document,
      command("object.flip", { objectId, axis: "horizontal" }),
    );

    expect(readCanvasObjectV2(document, objectId)?.geometry.flipX).toBe(true);
    expect(applyCanvasHistoryEntry(document, history, "undo").status).toBe(
      "applied",
    );
    expect(readCanvasObjectV2(document, objectId)?.geometry.flipX).toBe(false);
    expect(applyCanvasHistoryEntry(document, history, "redo").status).toBe(
      "applied",
    );
    expect(readCanvasObjectV2(document, objectId)?.geometry.flipX).toBe(true);
  });

  it("undoes and redoes a durable group frame and its membership", () => {
    const document = createProductCanvasDocument(canvasId);
    putCanvasObjectV2(document, shape());
    putCanvasObjectV2(document, icon());
    const groupId = "55555555-5555-4555-8555-555555555555";
    const { history } = executeProductCanvasCommandWithHistory(
      document,
      command("selection.group", {
        objectIds: [shape().id, icon().id],
        groupId,
      }),
    );
    expect(readCanvasGroupV2(document, groupId)).toBeDefined();
    expect(applyCanvasHistoryEntry(document, history, "undo").status).toBe(
      "applied",
    );
    expect(readCanvasGroupV2(document, groupId)).toBeUndefined();
    expect(readCanvasObjectV2(document, objectId)?.groupId).toBeNull();
    expect(applyCanvasHistoryEntry(document, history, "redo").status).toBe(
      "applied",
    );
    expect(readCanvasGroupV2(document, groupId)).toBeDefined();
    expect(readCanvasObjectV2(document, objectId)?.groupId).toBe(groupId);
  });

  it("continues valid styling and annotation creation beside a malformed entry", () => {
    const document = createProductCanvasDocument(canvasId);
    const malformedId = "33333333-3333-4333-8333-333333333399";
    const malformed = new Y.Map<unknown>();
    malformed.set("id", malformedId);
    document
      .getMap<Y.Map<unknown>>("canvas-objects-v2")
      .set(malformedId, malformed);
    document.getArray<string>("canvas-order-v2").push([malformedId]);
    putCanvasObjectV2(document, shape());

    executeProductCanvasCommandWithHistory(
      document,
      command("object.style", {
        objectId,
        style: { outlinePattern: "dashed" },
      }),
    );
    executeProductCanvasCommandWithHistory(
      document,
      command("object.create", { object: annotation(annotationId) }),
    );

    expect(readCanvasObjectV2(document, objectId)?.style.outlinePattern).toBe(
      "dashed",
    );
    expect(readCanvasObjectV2(document, annotationId)).toEqual(
      annotation(annotationId),
    );
    expect(listCanvasObjectsV2(document)).toHaveLength(2);
    expect(
      document.getMap<Y.Map<unknown>>("canvas-objects-v2").get(malformedId),
    ).toBe(malformed);
  });

  it("reverses its text while preserving a later unrelated move", () => {
    const document = createProductCanvasDocument(canvasId);
    putCanvasObjectV2(document, shape());
    const { history } = executeProductCanvasCommandWithHistory(
      document,
      command("object.patch", {
        objectId,
        objectType: "shape",
        text: "AI draft",
      }),
    );
    executeProductCanvasCommand(
      document,
      command(
        "object.move",
        { objectId, x: 620, y: 280 },
        "2026-08-11T20:01:00.000Z",
      ),
    );

    const result = applyCanvasHistoryEntry(document, history, "undo");
    expect(result.status).toBe("applied");
    expect(result.conflicts).toEqual([]);
    expect(readCanvasObjectV2(document, objectId)).toMatchObject({
      text: "Original",
      geometry: { x: 620, y: 280 },
      updatedAt: "2026-08-11T20:01:00.000Z",
    });
  });

  it("reports a same-field conflict instead of overwriting later content", () => {
    const document = createProductCanvasDocument(canvasId);
    putCanvasObjectV2(document, shape());
    const { history } = executeProductCanvasCommandWithHistory(
      document,
      command("object.patch", {
        objectId,
        objectType: "shape",
        text: "First revision",
      }),
    );
    executeProductCanvasCommand(
      document,
      command(
        "object.patch",
        {
          objectId,
          objectType: "shape",
          text: "Collaborator revision",
        },
        "2026-08-11T20:02:00.000Z",
      ),
    );

    const result = applyCanvasHistoryEntry(document, history, "undo");
    expect(result.conflicts).toContain(`${objectId}:text`);
    const current = readCanvasObjectV2(document, objectId);
    if (!current || current.type !== "shape") throw new Error("Shape missing.");
    expect(current.text).toBe("Collaborator revision");
  });

  it("restores stacking order when it has not diverged", () => {
    const document = createProductCanvasDocument(canvasId);
    const secondId = "44444444-4444-4444-8444-444444444444";
    putCanvasObjectV2(document, shape());
    putCanvasObjectV2(document, shape(secondId));
    const { history } = executeProductCanvasCommandWithHistory(
      document,
      command("object.reorder", { objectId, direction: "front" }),
    );
    expect(readCanvasOrderV2(document)).toEqual([secondId, objectId]);
    expect(applyCanvasHistoryEntry(document, history, "undo").status).toBe(
      "applied",
    );
    expect(readCanvasOrderV2(document)).toEqual([objectId, secondId]);
  });
});
