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
const iconId = "66666666-6666-4666-8666-666666666666";
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

function icon(): Extract<CanvasObjectV2, { type: "icon" }> {
  return {
    schemaVersion: 2,
    id: iconId,
    canvasId,
    createdBy: actorId,
    createdAt: issuedAt,
    updatedAt: issuedAt,
    type: "icon",
    catalog: "phosphor",
    catalogVersion: "2.1.1",
    iconName: "brain",
    iconVariant: "fill",
    parentId: null,
    parentRelative: null,
    geometry: { x: 200, y: 80, width: 96, height: 96, rotation: 0 },
    style: {
      fill: "#7c3aed",
      outline: "#312e81",
      outlineWidth: 2,
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      fontSize: 16,
      opacity: 0.8,
    },
  };
}

describe("product canvas command boundary", () => {
  it("creates and independently styles a catalog-backed icon", () => {
    const document = createProductCanvasDocument(canvasId);
    executeProductCanvasCommand(
      document,
      baseCommand("object.create", { object: icon() }),
    );
    executeProductCanvasCommand(
      document,
      baseCommand("object.style", {
        objectId: iconId,
        style: {
          fill: "#16a34a",
          outline: "#052e16",
          outlineWidth: 4,
          outlinePattern: "dotted",
          opacity: 0.55,
        },
      }),
    );

    expect(readCanvasObjectV2(document, iconId)).toMatchObject({
      type: "icon",
      iconName: "brain",
      style: {
        fill: "#16a34a",
        outline: "#052e16",
        outlineWidth: 4,
        outlinePattern: "dotted",
        opacity: 0.55,
      },
    });
  });

  it("allows connectors and annotations to target icons", () => {
    const document = createProductCanvasDocument(canvasId);
    putCanvasObjectV2(document, icon());
    putCanvasObjectV2(document, annotation());

    executeProductCanvasCommand(
      document,
      baseCommand("annotation.attach", {
        objectId: connectorId,
        targetObjectId: iconId,
      }),
    );
    expect(readCanvasObjectV2(document, connectorId)).toMatchObject({
      attachedObjectId: iconId,
    });

    const connector = {
      schemaVersion: 2 as const,
      id: shapeId,
      canvasId,
      createdBy: actorId,
      createdAt: issuedAt,
      updatedAt: issuedAt,
      type: "connector" as const,
      start: {
        kind: "attached" as const,
        objectId: iconId,
        anchor: "right" as const,
      },
      end: { kind: "free" as const, x: 420, y: 120 },
      geometry: { x: 0, y: 0, width: 0, height: 0, rotation: 0 },
      style: {
        fill: null,
        outline: "#334155",
        outlineWidth: 2,
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        fontSize: 16,
      },
    };
    executeProductCanvasCommand(
      document,
      baseCommand("object.create", { object: connector }),
    );
    expect(readCanvasObjectV2(document, shapeId)).toMatchObject({
      start: { kind: "attached", objectId: iconId, anchor: "right" },
    });
  });

  it("nests, proportionally transforms, reparents, and detaches icons", () => {
    const document = createProductCanvasDocument(canvasId);
    const parent = shape();
    const secondParent = {
      ...shape(secondShapeId),
      geometry: { x: 300, y: 40, width: 160, height: 90, rotation: 0 },
    };
    const child = {
      ...icon(),
      geometry: { x: 60, y: 60, width: 40, height: 30, rotation: 0 },
    };
    putCanvasObjectV2(document, parent);
    putCanvasObjectV2(document, secondParent);
    putCanvasObjectV2(document, child);

    executeProductCanvasCommand(
      document,
      baseCommand("icon.nest", { objectId: iconId, parentId: shapeId }),
    );
    expect(readCanvasObjectV2(document, iconId)).toMatchObject({
      parentId: shapeId,
      parentRelative: {
        x: 0.25,
        y: 2 / 9,
        width: 0.25,
        height: 1 / 3,
      },
    });

    executeProductCanvasCommand(
      document,
      baseCommand("object.move", { objectId: shapeId, x: 100, y: 140 }),
    );
    expect(readCanvasObjectV2(document, iconId)).toMatchObject({
      geometry: { x: 140, y: 160, width: 40, height: 30 },
    });

    executeProductCanvasCommand(
      document,
      baseCommand("object.resize", {
        objectId: shapeId,
        width: 320,
        height: 180,
      }),
    );
    expect(readCanvasObjectV2(document, iconId)).toMatchObject({
      geometry: { x: 180, y: 180, width: 80, height: 60 },
    });

    executeProductCanvasCommand(
      document,
      baseCommand("icon.detach", { objectId: iconId }),
    );
    expect(readCanvasObjectV2(document, iconId)).toMatchObject({
      parentId: null,
      parentRelative: null,
      geometry: { x: 180, y: 180, width: 80, height: 60 },
    });

    executeProductCanvasCommand(
      document,
      baseCommand("object.move", { objectId: iconId, x: 330, y: 55 }),
    );
    executeProductCanvasCommand(
      document,
      baseCommand("object.resize", {
        objectId: iconId,
        width: 60,
        height: 40,
      }),
    );
    executeProductCanvasCommand(
      document,
      baseCommand("icon.nest", {
        objectId: iconId,
        parentId: secondShapeId,
      }),
    );
    expect(readCanvasObjectV2(document, iconId)).toMatchObject({
      parentId: secondShapeId,
    });
  });

  it("rejects partial containment and cascades parent deletion", () => {
    const document = createProductCanvasDocument(canvasId);
    putCanvasObjectV2(document, shape());
    putCanvasObjectV2(document, icon());
    expect(() =>
      executeProductCanvasCommand(
        document,
        baseCommand("icon.nest", { objectId: iconId, parentId: shapeId }),
      ),
    ).toThrow("fully inside");

    executeProductCanvasCommand(
      document,
      baseCommand("object.move", { objectId: iconId, x: 50, y: 50 }),
    );
    executeProductCanvasCommand(
      document,
      baseCommand("object.resize", {
        objectId: iconId,
        width: 40,
        height: 40,
      }),
    );
    executeProductCanvasCommand(
      document,
      baseCommand("icon.nest", { objectId: iconId, parentId: shapeId }),
    );
    executeProductCanvasCommand(
      document,
      baseCommand("object.delete", { objectId: shapeId }),
    );
    expect(readCanvasObjectV2(document, shapeId)).toBeUndefined();
    expect(readCanvasObjectV2(document, iconId)).toBeUndefined();
  });
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

  it("attaches, follows, repositions, disconnects, and safely detaches annotations", () => {
    const document = createProductCanvasDocument(canvasId);
    const target = shape();
    putCanvasObjectV2(document, target);
    putCanvasObjectV2(document, annotation());

    executeProductCanvasCommand(
      document,
      baseCommand("annotation.attach", {
        objectId: connectorId,
        targetObjectId: shapeId,
      }),
    );
    expect(readCanvasObjectV2(document, connectorId)).toMatchObject({
      attachedObjectId: shapeId,
      attachmentOffset: { x: -15, y: -25 },
    });

    executeProductCanvasCommand(
      document,
      baseCommand("object.move", { objectId: shapeId, x: 150, y: 260 }),
    );
    expect(readCanvasObjectV2(document, connectorId)).toMatchObject({
      geometry: { x: 135, y: 235 },
      attachmentOffset: { x: -15, y: -25 },
    });

    executeProductCanvasCommand(
      document,
      baseCommand("object.move", { objectId: connectorId, x: 90, y: 110 }),
    );
    expect(readCanvasObjectV2(document, connectorId)).toMatchObject({
      geometry: { x: 90, y: 110 },
      attachmentOffset: { x: -60, y: -150 },
    });

    executeProductCanvasCommand(
      document,
      baseCommand("annotation.disconnect", { objectId: connectorId }),
    );
    expect(readCanvasObjectV2(document, connectorId)).toMatchObject({
      attachedObjectId: null,
      attachmentOffset: null,
      geometry: { x: 90, y: 110 },
    });

    executeProductCanvasCommand(
      document,
      baseCommand("annotation.attach", {
        objectId: connectorId,
        targetObjectId: shapeId,
      }),
    );
    executeProductCanvasCommand(
      document,
      baseCommand("object.delete", { objectId: shapeId }),
    );
    expect(readCanvasObjectV2(document, connectorId)).toMatchObject({
      attachedObjectId: null,
      attachmentOffset: null,
      geometry: { x: 90, y: 110 },
    });
  });

  it("rejects ineligible annotation attachment targets", () => {
    const document = createProductCanvasDocument(canvasId);
    putCanvasObjectV2(document, annotation());
    const other = { ...annotation(), id: shapeId };
    putCanvasObjectV2(document, other);
    expect(() =>
      executeProductCanvasCommand(
        document,
        baseCommand("annotation.attach", {
          objectId: connectorId,
          targetObjectId: shapeId,
        }),
      ),
    ).toThrow("shape, icon, text, or table");
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
    expect(() =>
      executeProductCanvasCommand(
        document,
        baseCommand("object.style", {
          objectId: connectorId,
          style: { outlineWidth: 0 },
        }),
      ),
    ).toThrow("visible stroke thickness");
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
