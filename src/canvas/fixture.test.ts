// @vitest-environment node

import { describe, expect, it } from "vitest";

import { createMixedCanvasFixture, spikeDocumentId } from "@/canvas/fixture";
import { canvasObjectSchema } from "@/domain/canvas-object";

describe("deterministic canvas fixture", () => {
  it("creates exactly 1,000 valid mixed renderer-independent objects", () => {
    const first = createMixedCanvasFixture();
    const second = createMixedCanvasFixture();
    expect(first).toEqual(second);
    expect(first).toHaveLength(1_000);
    expect(new Set(first.map(({ type }) => type))).toEqual(
      new Set(["shape", "text", "table", "document", "connector"]),
    );
    expect(
      first.every((object) => canvasObjectSchema.safeParse(object).success),
    ).toBe(true);
    expect(
      first.some(
        (object) =>
          object.type === "document" && object.documentId === spikeDocumentId,
      ),
    ).toBe(true);
  });
});
