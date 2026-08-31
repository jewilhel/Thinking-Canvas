import { describe, expect, it } from "vitest";

import {
  createCanvasClipboardPayload,
  parseCanvasClipboard,
  remapCanvasClipboard,
  serializeCanvasClipboard,
} from "@/canvas/canvas-clipboard";
import type { CanvasObjectV2 } from "@/canvas/canvas-document";

const canvasId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const now = "2026-08-11T20:00:00.000Z";

function shape(id: string, groupId: string | null = null): CanvasObjectV2 {
  return {
    schemaVersion: 2,
    id,
    canvasId,
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
    groupId,
    type: "shape",
    shape: "rectangle",
    text: id,
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

function makeConnector(
  id: string,
  startObjectId: string,
  endObjectId: string,
): CanvasObjectV2 {
  const template = shape(id);
  return {
    schemaVersion: 2,
    id,
    canvasId,
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
    groupId: null,
    type: "connector",
    start: { kind: "attached", objectId: startObjectId, anchor: "right" },
    end: { kind: "attached", objectId: endObjectId, anchor: "left" },
    geometry: { ...template.geometry },
    style: { ...template.style, fill: null },
  };
}

function nestedIcon(
  parentId: string,
): Extract<CanvasObjectV2, { type: "icon" }> {
  return {
    schemaVersion: 2,
    id: "99999999-9999-4999-8999-999999999999",
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
    parentId,
    parentRelative: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
    geometry: { x: 60, y: 62.5, width: 80, height: 45, rotation: 0 },
    style: {
      fill: "#7c3aed",
      outline: "#312e81",
      outlineWidth: 2,
      fontFamily: "Inter, sans-serif",
      fontSize: 16,
    },
  };
}

describe("canvas clipboard", () => {
  it("duplicates a parent with its child and detaches a copied child alone", () => {
    const parent = shape("33333333-3333-4333-8333-333333333333");
    const child = nestedIcon(parent.id);
    const payload = createCanvasClipboardPayload([parent, child], [parent.id]);
    expect(payload.objects).toHaveLength(2);

    const duplicated = remapCanvasClipboard(payload, {
      canvasId,
      actorId,
      issuedAt: now,
    });
    const duplicatedParent = duplicated.find(
      (object) => object.type === "shape",
    )!;
    expect(duplicated.find((object) => object.type === "icon")).toMatchObject({
      parentId: duplicatedParent.id,
      parentRelative: child.parentRelative,
      geometry: { x: 92, y: 94.5, width: 80, height: 45 },
    });

    expect(
      createCanvasClipboardPayload([parent, child], [child.id]).objects[0],
    ).toMatchObject({ parentId: null, parentRelative: null });
  });
  it("duplicates canonical annotations without losing editable stroke data", () => {
    const source: CanvasObjectV2 = {
      schemaVersion: 2,
      id: "77777777-7777-4777-8777-777777777777",
      canvasId,
      createdBy: actorId,
      createdAt: now,
      updatedAt: now,
      groupId: null,
      type: "annotation",
      strokeVersion: 1,
      pointerType: "pen",
      points: [0, 0, 20, 10, 40, 0],
      pressures: [0.2, 0.8, 0.4],
      baseWidth: 40,
      baseHeight: 10,
      temporary: true,
      attachedObjectId: null,
      geometry: { x: 10, y: 20, width: 40, height: 10, rotation: 0 },
      style: {
        fill: null,
        outline: "#7c3aed",
        outlineWidth: 5,
        fontFamily: "Inter, sans-serif",
        fontSize: 16,
      },
    };

    const [duplicate] = remapCanvasClipboard(
      createCanvasClipboardPayload([source], [source.id]),
      { canvasId, actorId, issuedAt: now, offset: 32 },
    );

    expect(duplicate).toMatchObject({
      type: "annotation",
      points: source.points,
      pressures: source.pressures,
      temporary: true,
      geometry: { x: 42, y: 52, width: 40, height: 10 },
      style: { outline: "#7c3aed", outlineWidth: 5 },
    });
    expect(duplicate?.id).not.toBe(source.id);
  });

  it("remaps an internal annotation attachment and detaches an external one", () => {
    const target = shape("88888888-8888-4888-8888-888888888888");
    const attached: CanvasObjectV2 = {
      schemaVersion: 2,
      id: "99999999-9999-4999-8999-999999999999",
      canvasId,
      createdBy: actorId,
      createdAt: now,
      updatedAt: now,
      groupId: null,
      type: "annotation",
      strokeVersion: 1,
      pointerType: "pen",
      points: [0, 0, 20, 10],
      pressures: [0.5, 0.5],
      temporary: true,
      attachedObjectId: target.id,
      attachmentOffset: { x: 4, y: 8 },
      geometry: { x: 24, y: 48, width: 20, height: 10, rotation: 0 },
      style: { ...target.style, fill: null },
    };

    const internal = remapCanvasClipboard(
      createCanvasClipboardPayload(
        [target, attached],
        [target.id, attached.id],
      ),
      { canvasId, actorId, issuedAt: now },
    );
    const pastedTarget = internal.find((object) => object.type === "shape")!;
    const pastedAnnotation = internal.find(
      (object) => object.type === "annotation",
    );
    expect(pastedAnnotation).toMatchObject({
      attachedObjectId: pastedTarget.id,
      attachmentOffset: { x: 4, y: 8 },
      geometry: { x: 56, y: 80 },
    });

    const external = createCanvasClipboardPayload(
      [target, attached],
      [attached.id],
    );
    expect(external.objects[0]).toMatchObject({
      attachedObjectId: null,
      attachmentOffset: null,
      geometry: attached.geometry,
    });
  });

  it("remaps object, group, and internal connector references", () => {
    const firstId = "33333333-3333-4333-8333-333333333333";
    const secondId = "44444444-4444-4444-8444-444444444444";
    const connectorId = "55555555-5555-4555-8555-555555555555";
    const groupId = "66666666-6666-4666-8666-666666666666";
    const objects: CanvasObjectV2[] = [
      shape(firstId, groupId),
      shape(secondId, groupId),
      makeConnector(connectorId, firstId, secondId),
    ];
    const payload = createCanvasClipboardPayload(
      objects,
      objects.map((object) => object.id),
    );
    const pasted = remapCanvasClipboard(payload, {
      canvasId,
      actorId,
      issuedAt: now,
    });
    const [first, second, connector] = pasted;

    expect(first!.id).not.toBe(firstId);
    expect(first!.groupId).toBe(second!.groupId);
    expect(first!.groupId).not.toBe(groupId);
    expect(first!.geometry.x).toBe(52);
    expect(connector).toMatchObject({
      type: "connector",
      start: { kind: "attached", objectId: first!.id },
      end: { kind: "attached", objectId: second!.id },
    });
  });

  it("detaches connector references to objects outside the copied selection", () => {
    const firstId = "33333333-3333-4333-8333-333333333333";
    const externalId = "44444444-4444-4444-8444-444444444444";
    const connectorId = "55555555-5555-4555-8555-555555555555";
    const objects: CanvasObjectV2[] = [
      shape(firstId),
      shape(externalId),
      makeConnector(connectorId, firstId, externalId),
    ];
    const payload = createCanvasClipboardPayload(objects, [
      firstId,
      connectorId,
    ]);
    const connector = payload.objects.find(
      (object) => object.type === "connector",
    );
    expect(connector).toMatchObject({
      start: { kind: "attached", objectId: firstId },
      end: { kind: "free", x: 20, y: 85 },
    });
  });

  it("round-trips valid payloads and rejects untrusted fields", () => {
    const payload = createCanvasClipboardPayload(
      [shape("33333333-3333-4333-8333-333333333333")],
      ["33333333-3333-4333-8333-333333333333"],
    );
    expect(parseCanvasClipboard(serializeCanvasClipboard(payload))).toEqual(
      payload,
    );
    expect(() =>
      parseCanvasClipboard(
        JSON.stringify({ ...payload, __protoPollution: { admin: true } }),
      ),
    ).toThrow();
  });
});
