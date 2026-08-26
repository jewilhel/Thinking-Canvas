import * as Y from "yjs";
import { describe, expect, it } from "vitest";

import {
  buildTrustedCanvasUpdate,
  stableAiToolCommandId,
} from "@/ai/trusted-execution";
import {
  createProductCanvasDocument,
  putCanvasObjectV2,
  readCanvasObjectV2,
  readCanvasOrderV2,
  type CanvasObjectV2,
} from "@/canvas/canvas-document";

const canvasId = "20000000-0000-4000-8000-000000000001";
const actorId = "10000000-0000-4000-8000-000000000001";
const runId = "80000000-0000-4000-8000-000000000001";
const shapeId = "61000000-0000-4000-8000-000000000001";
const secondShapeId = "61000000-0000-4000-8000-000000000002";
const connectorId = "61000000-0000-4000-8000-000000000003";
const textId = "61000000-0000-4000-8000-000000000004";
const tableId = "61000000-0000-4000-8000-000000000005";
const createdId = "61000000-0000-4000-8000-000000000006";
const duplicatedId = "61000000-0000-4000-8000-000000000007";
const groupId = "61000000-0000-4000-8000-000000000008";
const timestamp = "2026-08-25T09:00:00.000Z";

const style = {
  fill: "#ffffff" as string | null,
  outline: "#334155",
  outlineWidth: 2,
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  fontSize: 16,
};

function shape(id: string, x: number): CanvasObjectV2 {
  return {
    schemaVersion: 2,
    id,
    canvasId,
    createdBy: actorId,
    createdAt: timestamp,
    updatedAt: timestamp,
    type: "shape",
    shape: "rectangle",
    text: "Idea",
    geometry: { x, y: 40, width: 160, height: 90, rotation: 0 },
    style,
  };
}

function preparedDocument() {
  const document = createProductCanvasDocument(canvasId);
  putCanvasObjectV2(document, shape(shapeId, 20));
  putCanvasObjectV2(document, shape(secondShapeId, 420));
  putCanvasObjectV2(document, {
    schemaVersion: 2,
    id: connectorId,
    canvasId,
    createdBy: actorId,
    createdAt: timestamp,
    updatedAt: timestamp,
    type: "connector",
    start: { kind: "free", x: 180, y: 85 },
    end: { kind: "attached", objectId: secondShapeId, anchor: "left" },
    geometry: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
    style: { ...style, fill: null },
  });
  putCanvasObjectV2(document, {
    schemaVersion: 2,
    id: textId,
    canvasId,
    createdBy: actorId,
    createdAt: timestamp,
    updatedAt: timestamp,
    type: "text",
    text: "Detail",
    geometry: { x: 20, y: 180, width: 240, height: 80, rotation: 0 },
    style,
  });
  putCanvasObjectV2(document, {
    schemaVersion: 2,
    id: tableId,
    canvasId,
    createdBy: actorId,
    createdAt: timestamp,
    updatedAt: timestamp,
    type: "table",
    cells: [["A"]],
    geometry: { x: 300, y: 180, width: 240, height: 120, rotation: 0 },
    style,
  });
  return document;
}

describe("trusted AI canvas execution", () => {
  it("maps every strict mutation to product invariants in one atomic Yjs update", async () => {
    const document = preparedDocument();
    const before = Y.encodeStateAsUpdate(document);
    const execution = await buildTrustedCanvasUpdate({
      document,
      canvasId,
      actorId,
      runId,
      callKey: "all-product-commands",
      commands: [
        { type: "object.create", payload: { object: shape(createdId, 600) } },
        {
          type: "object.patch",
          payload: { objectId: shapeId, objectType: "shape", text: "Reframed" },
        },
        {
          type: "object.patch",
          payload: { objectId: textId, objectType: "text", text: "Expanded" },
        },
        {
          type: "object.patch",
          payload: {
            objectId: tableId,
            objectType: "table",
            cells: [["A", "B"]],
          },
        },
        { type: "object.move", payload: { objectId: shapeId, x: 80, y: 120 } },
        {
          type: "object.resize",
          payload: { objectId: shapeId, width: 240, height: 140 },
        },
        {
          type: "object.style",
          payload: {
            objectId: shapeId,
            style: { fill: "#fef3c7", fontWeight: "bold" },
          },
        },
        {
          type: "connector.endpoint",
          payload: {
            objectId: connectorId,
            endpoint: "start",
            value: { kind: "attached", objectId: shapeId, anchor: "right" },
          },
        },
        {
          type: "object.reorder",
          payload: { objectId: shapeId, direction: "front" },
        },
        {
          type: "selection.group",
          payload: { objectIds: [shapeId, secondShapeId], groupId },
        },
        { type: "selection.ungroup", payload: { groupId } },
        {
          type: "selection.duplicate",
          payload: { objects: [shape(duplicatedId, 120)] },
        },
        { type: "object.delete", payload: { objectId: createdId } },
      ],
    });

    expect(Y.encodeStateAsUpdate(document)).toEqual(before);
    expect(new Set(execution.commandTypes)).toEqual(
      new Set([
        "object.create",
        "object.patch",
        "object.move",
        "object.resize",
        "object.style",
        "connector.endpoint",
        "object.reorder",
        "selection.group",
        "selection.ungroup",
        "selection.duplicate",
        "object.delete",
      ]),
    );

    const collaborator = new Y.Doc();
    Y.applyUpdate(collaborator, before);
    Y.applyUpdate(collaborator, execution.update);
    expect(readCanvasObjectV2(collaborator, shapeId)).toMatchObject({
      text: "Reframed",
      geometry: { x: 80, y: 120, width: 240, height: 140 },
      style: { fill: "#fef3c7", fontWeight: "bold" },
      groupId: null,
    });
    expect(readCanvasObjectV2(collaborator, textId)).toMatchObject({
      text: "Expanded",
    });
    expect(readCanvasObjectV2(collaborator, tableId)).toMatchObject({
      cells: [["A", "B"]],
    });
    expect(readCanvasObjectV2(collaborator, connectorId)).toMatchObject({
      start: { kind: "attached", objectId: shapeId, anchor: "right" },
    });
    expect(readCanvasObjectV2(collaborator, duplicatedId)).toBeDefined();
    expect(readCanvasObjectV2(collaborator, createdId)).toBeUndefined();
    expect(readCanvasOrderV2(collaborator).at(-2)).toBe(shapeId);
  });

  it("uses a stable tool command identity and rejects command 51 before persistence", async () => {
    await expect(
      Promise.all([
        stableAiToolCommandId({ runId, callKey: "retry" }),
        stableAiToolCommandId({ runId, callKey: "retry" }),
      ]),
    ).resolves.toEqual([
      await stableAiToolCommandId({ runId, callKey: "retry" }),
      await stableAiToolCommandId({ runId, callKey: "retry" }),
    ]);

    const document = preparedDocument();
    await expect(
      buildTrustedCanvasUpdate({
        document,
        canvasId,
        actorId,
        runId,
        callKey: "too-many",
        commands: Array.from({ length: 51 }, (_, index) => ({
          type: "object.move",
          payload: { objectId: shapeId, x: index, y: index },
        })),
      }),
    ).rejects.toThrow();
    expect(readCanvasObjectV2(document, shapeId)?.geometry.x).toBe(20);
  });
});
