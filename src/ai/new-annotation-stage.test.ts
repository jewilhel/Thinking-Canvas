import { describe, expect, it } from "vitest";

import { materializeReviewNewAnnotations } from "@/ai/new-annotation-stage";

const input = {
  runId: "11111111-1111-4111-8111-111111111111",
  callKey: "annotation-call",
  canvasId: "22222222-2222-4222-8222-222222222222",
  actorId: "33333333-3333-4333-8333-333333333333",
  issuedAt: "2026-08-30T00:00:00.000Z",
};

describe("server-identified AI annotation creation", () => {
  it("canonicalizes bounded world points and derives a stable object identity", async () => {
    const argumentsValue = {
      summary: "Add one purple annotation.",
      annotations: [
        {
          key: "purple-stroke",
          points: [
            { x: 100, y: 120, pressure: 0.2 },
            { x: 160, y: 150, pressure: 0.8 },
            { x: 220, y: 120, pressure: 0.4 },
          ],
          outline: "#7c3aed",
          outlineWidth: 5,
        },
      ],
      explanations: [
        {
          key: "purple-stroke",
          whatChanged: "Added one curved purple annotation.",
          why: "The comment requested a visual annotation.",
        },
      ],
    };
    const first = await materializeReviewNewAnnotations({
      ...input,
      arguments: argumentsValue,
    });
    const second = await materializeReviewNewAnnotations({
      ...input,
      arguments: argumentsValue,
    });
    expect(first.commands).toEqual(second.commands);
    expect(first.commands[0]).toMatchObject({
      type: "object.create",
      payload: {
        object: {
          type: "annotation",
          temporary: true,
          pointerType: "mouse",
          points: [5, 5, 65, 35, 125, 5],
          pressures: [0.2, 0.8, 0.4],
          geometry: { x: 95, y: 115, width: 130, height: 40 },
          style: { outline: "#7c3aed", outlineWidth: 5 },
        },
      },
    });
    const created = first.commands[0];
    if (created?.type !== "object.create") {
      throw new Error("Expected one annotation creation command.");
    }
    expect(first.explanations[0]?.objectId).toBe(created.payload.object.id);
  });

  it("rejects degenerate and oversized provider paths", async () => {
    await expect(
      materializeReviewNewAnnotations({
        ...input,
        arguments: {
          summary: "Invalid",
          annotations: [
            {
              key: "flat",
              points: [
                { x: 1, y: 1, pressure: 0.5 },
                { x: 1, y: 1, pressure: 0.5 },
              ],
              outline: "#000000",
              outlineWidth: 5,
            },
          ],
          explanations: [{ key: "flat", whatChanged: "None", why: "Invalid" }],
        },
      }),
    ).rejects.toThrow("visible movement");

    await expect(
      materializeReviewNewAnnotations({
        ...input,
        arguments: {
          summary: "Too many",
          annotations: [
            {
              key: "long",
              points: Array.from({ length: 65 }, (_, index) => ({
                x: index,
                y: index,
                pressure: 0.5,
              })),
              outline: "#000000",
              outlineWidth: 5,
            },
          ],
          explanations: [
            { key: "long", whatChanged: "Too much", why: "Invalid" },
          ],
        },
      }),
    ).rejects.toThrow();
  });
});
