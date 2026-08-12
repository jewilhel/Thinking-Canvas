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

describe("canvas clipboard", () => {
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
