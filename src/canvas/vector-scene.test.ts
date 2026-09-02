import { describe, expect, it } from "vitest";

import { catalogIconToVectorScene } from "@/canvas/vector-scene";

describe("provider-neutral vector scene", () => {
  it("preserves normalized path geometry without a provider dependency", () => {
    expect(
      catalogIconToVectorScene({ viewBox: 256, paths: ["M0 0H256V256Z"] }),
    ).toEqual({ viewBox: 256, paths: ["M0 0H256V256Z"] });
  });

  it("rejects empty scenes", () => {
    expect(() =>
      catalogIconToVectorScene({ viewBox: 256, paths: [] }),
    ).toThrow();
  });
});
