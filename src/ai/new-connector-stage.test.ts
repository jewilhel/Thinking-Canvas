import { describe, expect, it } from "vitest";

import { materializeReviewNewConnectors } from "@/ai/new-connector-stage";
import { validateCanvasReviewStage } from "@/ai/proposals";
import {
  createProductCanvasDocument,
  putCanvasObjectV2,
  type CanvasObjectV2,
} from "@/canvas/canvas-document";

const ids = {
  run: "72000000-0000-4000-8000-000000000001",
  canvas: "72000000-0000-4000-8000-000000000002",
  actor: "72000000-0000-4000-8000-000000000003",
  red: "72000000-0000-4000-8000-000000000004",
  blue: "72000000-0000-4000-8000-000000000005",
};

function shape(id: string, x: number, y: number): CanvasObjectV2 {
  return {
    schemaVersion: 2,
    id,
    canvasId: ids.canvas,
    createdBy: ids.actor,
    createdAt: "2026-08-28T19:00:00.000Z",
    updatedAt: "2026-08-28T19:00:00.000Z",
    type: "shape",
    shape: "rectangle",
    text: "Sticky",
    geometry: { x, y, width: 200, height: 120, rotation: 0 },
    style: {
      fill: "#fef3c7",
      outline: "#18181b",
      outlineWidth: 2,
      fontFamily: "Inter",
      fontSize: 16,
      fontWeight: "bold",
      textAlign: "center",
      listStyle: "none",
      linkUrl: null,
      textColor: "#18181b",
    },
  };
}

describe("reviewable connector materialization", () => {
  it("creates a stable directional connector with safe edge anchors", async () => {
    const sourceObjects = [shape(ids.red, 0, 0), shape(ids.blue, 300, 20)];
    const input = {
      arguments: {
        summary: "Connect the notes clockwise.",
        connectors: [
          {
            key: "red-to-blue",
            fromObjectId: ids.red,
            toObjectId: ids.blue,
            outline: "#475569",
            outlineWidth: 2,
          },
        ],
        explanations: [
          {
            key: "red-to-blue",
            whatChanged: "Connected Red to Blue.",
            why: "The user requested a clockwise sequence.",
          },
        ],
      },
      sourceObjects,
      runId: ids.run,
      callKey: "clockwise-loop",
      canvasId: ids.canvas,
      actorId: ids.actor,
      issuedAt: "2026-08-28T19:10:00.000Z",
    };
    const first = await materializeReviewNewConnectors(input);
    const second = await materializeReviewNewConnectors(input);

    expect(second).toEqual(first);
    expect(first.commands[0]).toMatchObject({
      type: "object.create",
      payload: {
        object: {
          type: "connector",
          start: { objectId: ids.red, anchor: "right" },
          end: { objectId: ids.blue, anchor: "left" },
        },
      },
    });

    const document = createProductCanvasDocument(ids.canvas);
    sourceObjects.forEach((object) => putCanvasObjectV2(document, object));
    expect(
      validateCanvasReviewStage({
        document,
        canvasId: ids.canvas,
        actorId: ids.actor,
        commands: first.commands,
      }).objectChanges,
    ).toHaveLength(1);
  });

  it("rejects missing, non-shape, or self-connected endpoints", async () => {
    await expect(
      materializeReviewNewConnectors({
        arguments: {
          summary: "Invalid connector.",
          connectors: [
            {
              key: "loop",
              fromObjectId: ids.red,
              toObjectId: ids.red,
              outline: "#475569",
              outlineWidth: 2,
            },
          ],
          explanations: [
            { key: "loop", whatChanged: "None.", why: "Invalid." },
          ],
        },
        sourceObjects: [shape(ids.red, 0, 0)],
        runId: ids.run,
        callKey: "invalid",
        canvasId: ids.canvas,
        actorId: ids.actor,
      }),
    ).rejects.toThrow("two distinct existing shape objects");
  });
});
