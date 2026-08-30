import { describe, expect, it } from "vitest";

import {
  createProductCanvasDocument,
  listCanvasObjectsV2,
  putCanvasObjectV2,
  readCanvasObjectV2,
  readCanvasOrderV2,
  type CanvasObjectV2,
} from "@/canvas/canvas-document";
import { resolveConnectorPointsV2 } from "@/canvas/geometry";
import {
  executeProductCanvasCommand,
  ProductCanvasCommandConflictError,
} from "@/domain/canvas-command";

const canvasId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const shapeId = "33333333-3333-4333-8333-333333333333";
const secondShapeId = "44444444-4444-4444-8444-444444444444";
const connectorId = "55555555-5555-4555-8555-555555555555";
const issuedAt = "2026-08-11T20:00:00.000Z";

function baseCommand(type: string, payload: unknown) {
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

function shape(id = shapeId): CanvasObjectV2 {
  return {
    schemaVersion: 2,
    id,
    canvasId,
    createdBy: actorId,
    createdAt: issuedAt,
    updatedAt: issuedAt,
    type: "shape",
    shape: "rectangle",
    text: "Idea",
    geometry: { x: 20, y: 40, width: 160, height: 90, rotation: 0 },
    style: {
      fill: "#ffffff",
      outline: "#334155",
      outlineWidth: 2,
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      fontSize: 16,
    },
  };
}

function annotation(): Extract<CanvasObjectV2, { type: "annotation" }> {
  return {
    schemaVersion: 2,
    id: connectorId,
    canvasId,
    createdBy: actorId,
    createdAt: issuedAt,
    updatedAt: issuedAt,
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
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      fontSize: 16,
    },
  };
}

describe("product canvas command boundary", () => {
  it("creates only canonical new annotations through the command boundary", () => {
    const document = createProductCanvasDocument(canvasId);
    executeProductCanvasCommand(
      document,
      baseCommand("object.create", { object: annotation() }),
    );
    expect(readCanvasObjectV2(document, connectorId)).toEqual(annotation());

    expect(() =>
      executeProductCanvasCommand(
        createProductCanvasDocument(canvasId),
        baseCommand("object.create", {
          object: {
            ...annotation(),
            strokeVersion: undefined,
            pressures: undefined,
          },
        }),
      ),
    ).toThrow("canonical pressure samples");
  });

  it("promotes annotations idempotently and rejects other object types", () => {
    const document = createProductCanvasDocument(canvasId);
    putCanvasObjectV2(document, annotation());
    executeProductCanvasCommand(
      document,
      baseCommand("annotation.promote", { objectId: connectorId }),
    );
    const promoted = readCanvasObjectV2(document, connectorId);
    expect(promoted).toMatchObject({ type: "annotation", temporary: false });

    executeProductCanvasCommand(
      document,
      baseCommand("annotation.promote", { objectId: connectorId }),
    );
    expect(readCanvasObjectV2(document, connectorId)).toEqual(promoted);

    putCanvasObjectV2(document, shape());
    expect(() =>
      executeProductCanvasCommand(
        document,
        baseCommand("annotation.promote", { objectId: shapeId }),
      ),
    ).toThrow("Only annotations can be promoted");
  });

  it("captures a legacy annotation base before resize and persists object stroke patterns", () => {
    const document = createProductCanvasDocument(canvasId);
    putCanvasObjectV2(document, annotation());
    executeProductCanvasCommand(
      document,
      baseCommand("object.resize", {
        objectId: connectorId,
        width: 90,
        height: 60,
      }),
    );
    expect(readCanvasObjectV2(document, connectorId)).toMatchObject({
      baseWidth: 30,
      baseHeight: 30,
      geometry: { width: 90, height: 60 },
    });

    putCanvasObjectV2(document, shape());
    executeProductCanvasCommand(
      document,
      baseCommand("object.style", {
        objectId: shapeId,
        style: { outlineWidth: 8, outlinePattern: "dashed" },
      }),
    );
    expect(readCanvasObjectV2(document, shapeId)).toMatchObject({
      style: { outlineWidth: 8, outlinePattern: "dashed" },
    });

    expect(() =>
      executeProductCanvasCommand(
        document,
        baseCommand("object.style", {
          objectId: connectorId,
          style: { outlinePattern: "dotted" },
        }),
      ),
    ).toThrow("solid pressure-rendered stroke");
  });

  it("creates, patches, moves, resizes, and styles through validated commands", () => {
    const document = createProductCanvasDocument(canvasId);
    executeProductCanvasCommand(
      document,
      baseCommand("object.create", { object: shape() }),
    );
    executeProductCanvasCommand(
      document,
      baseCommand("object.patch", {
        objectId: shapeId,
        objectType: "shape",
        text: "Reframed idea",
      }),
    );
    executeProductCanvasCommand(
      document,
      baseCommand("object.move", { objectId: shapeId, x: 80, y: 120 }),
    );
    executeProductCanvasCommand(
      document,
      baseCommand("object.resize", {
        objectId: shapeId,
        width: 240,
        height: 140,
      }),
    );
    executeProductCanvasCommand(
      document,
      baseCommand("object.style", {
        objectId: shapeId,
        style: {
          fill: "#fef3c7",
          outline: "#d97706",
          fontSize: 22,
          fontWeight: "bold",
          textAlign: "right",
          listStyle: "numbered",
          linkUrl: "https://example.com/review",
          textColor: "#7c3aed",
        },
      }),
    );

    expect(readCanvasObjectV2(document, shapeId)).toMatchObject({
      text: "Reframed idea",
      geometry: { x: 80, y: 120, width: 240, height: 140 },
      style: {
        fill: "#fef3c7",
        outline: "#d97706",
        fontSize: 22,
        fontWeight: "bold",
        textAlign: "right",
        listStyle: "numbered",
        linkUrl: "https://example.com/review",
        textColor: "#7c3aed",
      },
    });
  });

  it("rejects executable and unsupported text link protocols", () => {
    const document = createProductCanvasDocument(canvasId);
    putCanvasObjectV2(document, shape());

    expect(() =>
      executeProductCanvasCommand(
        document,
        baseCommand("object.style", {
          objectId: shapeId,
          style: { linkUrl: "javascript:alert(1)" },
        }),
      ),
    ).toThrow();
  });

  it("recomputes attached geometry and safely detaches on target deletion", () => {
    const document = createProductCanvasDocument(canvasId);
    putCanvasObjectV2(document, shape());
    putCanvasObjectV2(document, {
      ...shape(secondShapeId),
      geometry: { ...shape().geometry, x: 420 },
    });
    const template = shape();
    putCanvasObjectV2(document, {
      schemaVersion: 2,
      id: connectorId,
      canvasId,
      createdBy: actorId,
      createdAt: issuedAt,
      updatedAt: issuedAt,
      type: "connector",
      start: { kind: "attached", objectId: shapeId, anchor: "right" },
      end: { kind: "attached", objectId: secondShapeId, anchor: "left" },
      geometry: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
      style: { ...template.style, fill: null },
    });

    const before = listCanvasObjectsV2(document);
    const beforeMap = new Map(before.map((object) => [object.id, object]));
    const connector = beforeMap.get(connectorId);
    if (!connector || connector.type !== "connector")
      throw new Error("Connector missing.");
    expect(resolveConnectorPointsV2(connector, beforeMap)).toEqual([
      180, 85, 420, 85,
    ]);

    executeProductCanvasCommand(
      document,
      baseCommand("object.move", { objectId: shapeId, x: 100, y: 40 }),
    );
    const moved = listCanvasObjectsV2(document);
    const movedMap = new Map(moved.map((object) => [object.id, object]));
    expect(
      resolveConnectorPointsV2(
        movedMap.get(connectorId) as typeof connector,
        movedMap,
      ),
    ).toEqual([260, 85, 420, 85]);

    executeProductCanvasCommand(
      document,
      baseCommand("object.delete", { objectId: shapeId }),
    );
    expect(readCanvasObjectV2(document, connectorId)).toMatchObject({
      start: { kind: "free", x: 260, y: 85 },
      end: { kind: "attached", objectId: secondShapeId, anchor: "left" },
    });
  });

  it("rejects identity, type, and actor-origin conflicts", () => {
    const document = createProductCanvasDocument(canvasId);
    putCanvasObjectV2(document, shape());

    expect(() =>
      executeProductCanvasCommand(
        document,
        baseCommand("object.patch", {
          objectId: shapeId,
          objectType: "text",
          text: "Wrong type",
        }),
      ),
    ).toThrow(ProductCanvasCommandConflictError);

    expect(() =>
      executeProductCanvasCommand(document, {
        ...baseCommand("object.delete", { objectId: shapeId }),
        origin: "ai",
      }),
    ).toThrow("Command origin must match the actor type.");

    expect(() =>
      executeProductCanvasCommand(
        document,
        baseCommand("connector.endpoint", {
          objectId: shapeId,
          endpoint: "start",
          value: {
            kind: "attached",
            objectId: "99999999-9999-4999-8999-999999999999",
            anchor: "center",
          },
        }),
      ),
    ).toThrow(ProductCanvasCommandConflictError);
  });

  it("groups, ungroups, reorders, and duplicates validated selections", () => {
    const document = createProductCanvasDocument(canvasId);
    putCanvasObjectV2(document, shape());
    putCanvasObjectV2(document, shape(secondShapeId));
    const groupId = "66666666-6666-4666-8666-666666666666";

    executeProductCanvasCommand(
      document,
      baseCommand("selection.group", {
        objectIds: [shapeId, secondShapeId],
        groupId,
      }),
    );
    expect(readCanvasObjectV2(document, shapeId)?.groupId).toBe(groupId);
    expect(readCanvasObjectV2(document, secondShapeId)?.groupId).toBe(groupId);

    expect(() =>
      executeProductCanvasCommand(
        document,
        baseCommand("selection.group", {
          objectIds: [shapeId, secondShapeId],
          groupId: "88888888-8888-4888-8888-888888888888",
        }),
      ),
    ).toThrow("Nested groups are not supported.");

    executeProductCanvasCommand(
      document,
      baseCommand("object.reorder", { objectId: shapeId, direction: "front" }),
    );
    expect(readCanvasOrderV2(document)).toEqual([secondShapeId, shapeId]);

    const duplicatedId = "77777777-7777-4777-8777-777777777777";
    executeProductCanvasCommand(
      document,
      baseCommand("selection.duplicate", {
        objects: [
          {
            ...shape(duplicatedId),
            geometry: { ...shape().geometry, x: 52, y: 72 },
          },
        ],
      }),
    );
    expect(readCanvasObjectV2(document, duplicatedId)).toMatchObject({
      geometry: { x: 52, y: 72 },
    });

    executeProductCanvasCommand(
      document,
      baseCommand("selection.ungroup", { groupId }),
    );
    expect(readCanvasObjectV2(document, shapeId)?.groupId).toBeNull();
    expect(readCanvasObjectV2(document, secondShapeId)?.groupId).toBeNull();
  });
});
