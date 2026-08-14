import { describe, expect, it } from "vitest";

import { resolvePickerPosition } from "@/components/canvas/custom-color-picker-position";

describe("resolvePickerPosition", () => {
  it("right-aligns beneath the custom swatch when the picker fits", () => {
    expect(
      resolvePickerPosition(
        { top: 250, right: 810, bottom: 286 },
        { width: 320, height: 440 },
        { width: 1090, height: 1076 },
      ),
    ).toEqual({ left: 490, top: 294, placement: "below" });
  });

  it("moves above the swatch when the remaining lower viewport is too short", () => {
    expect(
      resolvePickerPosition(
        { top: 516, right: 770, bottom: 552 },
        { width: 320, height: 440 },
        { width: 1280, height: 720 },
      ),
    ).toEqual({ left: 450, top: 68, placement: "above" });
  });

  it("keeps the picker inside a viewport that cannot fit either side", () => {
    expect(
      resolvePickerPosition(
        { top: 180, right: 300, bottom: 216 },
        { width: 320, height: 440 },
        { width: 360, height: 460 },
      ),
    ).toEqual({ left: 12, top: 12, placement: "clamped" });
  });
});
