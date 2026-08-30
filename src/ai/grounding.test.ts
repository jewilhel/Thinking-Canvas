import { describe, expect, it } from "vitest";

import {
  buildCanvasObjectDetails,
  ConnectedPathError,
  inspectCanvasObjects,
  inspectCommentThreads,
  validateConnectedPath,
} from "@/ai/grounding";
import {
  canvasObjectV2Schema,
  type CanvasObjectV2,
} from "@/canvas/canvas-document";

const canvasId = "20000000-0000-4000-8000-000000000001";
const actorId = "10000000-0000-4000-8000-000000000001";
const ids = {
  first: "61000000-0000-4000-8000-000000000001",
  second: "61000000-0000-4000-8000-000000000002",
  third: "61000000-0000-4000-8000-000000000003",
  connector: "61000000-0000-4000-8000-000000000004",
  duplicateConnector: "61000000-0000-4000-8000-000000000005",
};

function base(id: string) {
  return {
    schemaVersion: 2 as const,
    id,
    canvasId,
    createdBy: actorId,
    createdAt: "2026-08-24T12:00:00.000Z",
    updatedAt: "2026-08-24T12:00:00.000Z",
    geometry: { x: 0, y: 0, width: 100, height: 80, rotation: 0 },
    style: {
      fill: "#fff",
      outline: "#000",
      outlineWidth: 1,
      fontFamily: "Inter",
      fontSize: 16,
    },
  };
}

const first = canvasObjectV2Schema.parse({
  ...base(ids.first),
  type: "shape",
  shape: "rectangle",
  text: "First",
});
const second = canvasObjectV2Schema.parse({
  ...base(ids.second),
  type: "shape",
  shape: "rectangle",
  text: "Second",
});
const third = canvasObjectV2Schema.parse({
  ...base(ids.third),
  type: "text",
  text: "Third",
});

function connector(id: string): CanvasObjectV2 {
  return canvasObjectV2Schema.parse({
    ...base(id),
    type: "connector",
    start: { kind: "attached", objectId: ids.first, anchor: "right" },
    end: { kind: "attached", objectId: ids.second, anchor: "left" },
  });
}

describe("AI grounding tools", () => {
  it("builds ordered full object detail and pages it deterministically", () => {
    const details = buildCanvasObjectDetails(canvasId, [
      first,
      connector(ids.connector),
      second,
    ]);
    expect(details.map((detail) => detail.orderIndex)).toEqual([0, 1, 2]);
    expect(details[0]?.relationshipIds).toEqual([ids.second, ids.connector]);
    expect(
      inspectCanvasObjects(details, {
        tool: "inspect_canvas_objects",
        cursor: 0,
        limit: 2,
      }),
    ).toMatchObject({ total: 3, nextCursor: 2 });
  });

  it("projects annotation meaning and relationships with a bounded sample", () => {
    const annotationId = "61000000-0000-4000-8000-000000000006";
    const points = Array.from({ length: 100 }, (_, index) => [
      index,
      index % 7,
    ]).flat();
    const annotation = canvasObjectV2Schema.parse({
      ...base(annotationId),
      type: "annotation",
      strokeVersion: 1,
      pointerType: "pen",
      points,
      pressures: Array.from({ length: 100 }, () => 0.5),
      temporary: false,
      attachedObjectId: ids.first,
      attachmentOffset: { x: 4, y: 8 },
    });
    const details = buildCanvasObjectDetails(canvasId, [first, annotation]);
    expect(details[1]).toMatchObject({
      summary: "Promoted annotation · #000 · 1px · attached",
      relationshipIds: [ids.first],
      state: { type: "annotation", attachedObjectId: ids.first },
    });
    expect(
      details[1]?.state.type === "annotation"
        ? details[1].state.points.length
        : Number.POSITIVE_INFINITY,
    ).toBe(64);
    expect(details[0]?.relationshipIds).toContain(annotationId);
  });

  it("pages only authorized open and resolved thread details", () => {
    const thread = {
      id: "30000000-0000-4000-8000-000000000001",
      status: "resolved" as const,
      body: "Prior decision",
      authorKind: "human" as const,
      authorKey: actorId,
      targetObjectIds: [ids.first],
      participantKeys: [actorId, "primary-ai"],
      createdAt: "2026-08-24T12:00:00.000Z",
      updatedAt: "2026-08-24T12:00:00.000Z",
      replies: [],
      prompt: null,
    };
    expect(
      inspectCommentThreads([thread], {
        tool: "inspect_comment_threads",
        cursor: 0,
        limit: 25,
      }),
    ).toEqual({ items: [thread], nextCursor: null, total: 1 });
  });

  it("preserves valid connected selection order", () => {
    expect(
      validateConnectedPath({
        canvasId,
        objects: [first, connector(ids.connector), second],
        orderedObjectIds: [ids.first, ids.second],
      }),
    ).toEqual([ids.first, ids.second]);
  });

  it("rejects a connected path object from another canvas", () => {
    const foreign = canvasObjectV2Schema.parse({
      ...base(ids.third),
      canvasId: "20000000-0000-4000-8000-000000000002",
      type: "text",
      text: "Foreign",
    });
    expect(() =>
      validateConnectedPath({
        canvasId,
        objects: [foreign],
        orderedObjectIds: [foreign.id],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ConnectedPathError>>({
        code: "cross_canvas_object",
      }),
    );
  });

  it.each([
    {
      name: "stale",
      objects: [first, second],
      ids: [ids.first, ids.third],
      code: "stale_object",
    },
    {
      name: "disconnected",
      objects: [first, second, third],
      ids: [ids.first, ids.third],
      code: "not_connected",
    },
    {
      name: "ambiguous",
      objects: [
        first,
        second,
        connector(ids.connector),
        connector(ids.duplicateConnector),
      ],
      ids: [ids.first, ids.second],
      code: "ambiguous_path",
    },
  ])("rejects $name connected paths", ({ objects, ids: path, code }) => {
    try {
      validateConnectedPath({ canvasId, objects, orderedObjectIds: path });
      throw new Error("Expected path validation to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(ConnectedPathError);
      expect((error as ConnectedPathError).code).toBe(code);
    }
  });
});
