import { describe, expect, it } from "vitest";

import {
  coalesceReviewNewShapeToolCalls,
  materializeReviewNewShapes,
} from "@/ai/new-shape-stage";
import {
  validateCanvasReviewStage,
  validateReviewExplanations,
} from "@/ai/proposals";
import { assertReviewChangesWithinScope } from "@/ai/review-scope";
import { createProductCanvasDocument } from "@/canvas/canvas-document";

const ids = {
  run: "71000000-0000-4000-8000-000000000001",
  canvas: "71000000-0000-4000-8000-000000000002",
  actor: "71000000-0000-4000-8000-000000000003",
};

describe("reviewable new shape materialization", () => {
  it("combines provider-decomposed creation calls into one review set", () => {
    const calls = ["red", "blue"].map((key, index) => ({
      callKey: `create-${index}`,
      toolName: "stage_new_shapes",
      arguments: {
        summary: `Create ${key}.`,
        shapes: [
          {
            key: "sticky",
            shape: "rectangle",
            text: key,
            x: 100 + index * 224,
            y: 200,
            width: 200,
            height: 120,
            fill: key === "red" ? "#fecaca" : "#bfdbfe",
            outline: "#18181b",
            outlineWidth: 2,
            fontFamily: "Inter",
            fontSize: 16,
            fontWeight: "bold",
            textAlign: "center",
            textColor: "#18181b",
          },
        ],
        explanations: [
          {
            key: "sticky",
            whatChanged: `Created ${key}.`,
            why: "The user requested it.",
          },
        ],
      },
    }));

    expect(coalesceReviewNewShapeToolCalls(calls)).toMatchObject([
      {
        callKey: "create-0",
        toolName: "stage_new_shapes",
        arguments: {
          shapes: [{ key: "1-sticky" }, { key: "2-sticky" }],
          explanations: [{ key: "1-sticky" }, { key: "2-sticky" }],
        },
      },
    ]);
  });

  it("generates stable canonical identities and matching explanations", async () => {
    const argumentsValue = {
      summary: "Create the requested notes.",
      shapes: ["red", "blue"].map((key, index) => ({
        key,
        shape: "rectangle" as const,
        text: key[0]!.toUpperCase() + key.slice(1),
        x: 100 + index * 224,
        y: 200,
        width: 200,
        height: 120,
        fill: key === "red" ? "#fecaca" : "#bfdbfe",
        outline: "#18181b",
        outlineWidth: 2,
        fontFamily: "Inter",
        fontSize: 16,
        fontWeight: "bold" as const,
        textAlign: "center" as const,
        textColor: "#18181b",
      })),
      explanations: ["red", "blue"].map((key) => ({
        key,
        whatChanged: `Created ${key}.`,
        why: "The user requested it.",
      })),
    };
    const input = {
      arguments: argumentsValue,
      runId: ids.run,
      callKey: "create-colors",
      canvasId: ids.canvas,
      actorId: ids.actor,
      issuedAt: "2026-08-26T23:00:00.000Z",
    };
    const first = await materializeReviewNewShapes(input);
    const second = await materializeReviewNewShapes(input);

    expect(second).toEqual(first);
    expect(first.commands).toHaveLength(2);
    expect(first.explanations.map((item) => item.objectId)).toEqual(
      first.commands.map((command) =>
        command.type === "object.create" ? command.payload.object.id : null,
      ),
    );
    expect(first.commands[0]).toMatchObject({
      type: "object.create",
      payload: {
        object: {
          canvasId: ids.canvas,
          createdBy: ids.actor,
          type: "shape",
          shape: "rectangle",
          text: "Red",
        },
      },
    });

    const reviewStage = validateCanvasReviewStage({
      document: createProductCanvasDocument(ids.canvas),
      canvasId: ids.canvas,
      actorId: ids.actor,
      commands: first.commands,
    });
    expect(() =>
      assertReviewChangesWithinScope({
        scope: { kind: "world_space", objectIds: [] },
        changes: reviewStage.objectChanges,
      }),
    ).not.toThrow();
    expect(() =>
      assertReviewChangesWithinScope({
        scope: {
          kind: "single_object",
          objectIds: ["71000000-0000-4000-8000-000000000004"],
        },
        changes: reviewStage.objectChanges,
      }),
    ).toThrow("directly attached object");
    expect(
      validateReviewExplanations({
        reviewStage,
        explanations: first.explanations,
      }),
    ).toHaveLength(2);
  });
});
