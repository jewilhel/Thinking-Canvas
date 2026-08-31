import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  createProductCanvasDocument,
  listCanvasObjectsV2,
  putCanvasObjectV2,
  readCanvasObjectV2,
} from "@/canvas/canvas-document";
import { executeProductCanvasCommand } from "@/domain/canvas-command";

const canvasId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const parentId = "33333333-3333-4333-8333-333333333333";
const iconId = "44444444-4444-4444-8444-444444444444";
const now = "2026-08-30T00:00:00.000Z";

const style = {
  fill: "#ffffff",
  outline: "#334155",
  outlineWidth: 2,
  fontFamily: "Inter",
  fontSize: 16,
};

function command(type: string, payload: unknown) {
  return {
    schemaVersion: 2,
    commandId: crypto.randomUUID(),
    canvasId,
    actor: { id: actorId, type: "human" },
    origin: "human",
    issuedAt: now,
    type,
    payload,
  };
}

function seed() {
  const document = createProductCanvasDocument(canvasId);
  putCanvasObjectV2(document, {
    schemaVersion: 2,
    id: parentId,
    canvasId,
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
    type: "shape",
    shape: "rectangle",
    text: "Parent",
    geometry: { x: 100, y: 100, width: 400, height: 200, rotation: 0 },
    style,
  });
  putCanvasObjectV2(document, {
    schemaVersion: 2,
    id: iconId,
    canvasId,
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
    type: "icon",
    catalog: "phosphor",
    catalogVersion: "2.1.1",
    iconName: "brain",
    iconVariant: "fill",
    parentId: null,
    parentRelative: null,
    geometry: { x: 200, y: 150, width: 100, height: 100, rotation: 0 },
    style,
  });
  executeProductCanvasCommand(
    document,
    command("icon.nest", { objectId: iconId, parentId }),
  );
  return document;
}

describe("icon containment convergence", () => {
  it("converges a simultaneous child edit and parent resize without an orphan", () => {
    const source = seed();
    const left = new Y.Doc();
    const right = new Y.Doc();
    Y.applyUpdate(left, Y.encodeStateAsUpdate(source));
    Y.applyUpdate(right, Y.encodeStateAsUpdate(source));

    executeProductCanvasCommand(
      left,
      command("object.move", { objectId: iconId, x: 260, y: 170 }),
    );
    executeProductCanvasCommand(
      right,
      command("object.resize", {
        objectId: parentId,
        width: 800,
        height: 400,
      }),
    );

    const leftUpdate = Y.encodeStateAsUpdate(left);
    const rightUpdate = Y.encodeStateAsUpdate(right);
    Y.applyUpdate(left, rightUpdate);
    Y.applyUpdate(right, leftUpdate);

    expect(listCanvasObjectsV2(left)).toEqual(listCanvasObjectsV2(right));
    const parent = readCanvasObjectV2(left, parentId);
    const icon = readCanvasObjectV2(left, iconId);
    expect(parent?.type).toBe("shape");
    expect(icon?.type).toBe("icon");
    if (parent?.type !== "shape" || icon?.type !== "icon") return;
    expect(icon.parentId).toBe(parent.id);
    expect(icon.geometry).toMatchObject({
      x: parent.geometry.x + icon.parentRelative!.x * parent.geometry.width,
      y: parent.geometry.y + icon.parentRelative!.y * parent.geometry.height,
      width: icon.parentRelative!.width * parent.geometry.width,
      height: icon.parentRelative!.height * parent.geometry.height,
    });
  });
});
