import { describe, expect, it } from "vitest";

import { konvaStrokeDash, resolvedOutlinePattern } from "@/canvas/stroke-style";

describe("stroke style", () => {
  it("keeps existing objects solid by default", () => {
    expect(resolvedOutlinePattern(undefined)).toBe("solid");
    expect(konvaStrokeDash(undefined, 2)).toBeUndefined();
    expect(konvaStrokeDash("solid", 2)).toBeUndefined();
  });

  it("derives deterministic dash arrays from width", () => {
    expect(konvaStrokeDash("dashed", 2)).toEqual([8, 4]);
    expect(konvaStrokeDash("dotted", 3)).toEqual([3, 6]);
  });
});
