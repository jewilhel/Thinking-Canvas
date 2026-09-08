import { describe, expect, it } from "vitest";

import {
  captureStoryFraming,
  storyCameraSchema,
  viewportForStoryCamera,
} from "@/stories/story-model";

describe("story viewport framing", () => {
  it("round trips the current viewport through a world-space camera", () => {
    const viewport = { x: -320, y: 140, scale: 1.75 };
    const size = { width: 1280, height: 720 };
    const framing = captureStoryFraming(viewport, size);

    expect(viewportForStoryCamera(framing.camera, size)).toEqual(viewport);
    expect(framing.target.bounds.x).toBeCloseTo(
      (0 - viewport.x) / viewport.scale,
    );
    expect(framing.target.bounds.y).toBeCloseTo(
      (0 - viewport.y) / viewport.scale,
    );
    expect(framing.target.bounds.width).toBeCloseTo(
      size.width / viewport.scale,
    );
    expect(framing.target.bounds.height).toBeCloseTo(
      size.height / viewport.scale,
    );
  });

  it("keeps the world center and zoom on a differently sized viewport", () => {
    const framing = captureStoryFraming(
      { x: -120, y: -80, scale: 0.75 },
      { width: 900, height: 600 },
    );
    const resized = viewportForStoryCamera(framing.camera, {
      width: 1200,
      height: 800,
    });

    expect((1200 / 2 - resized.x) / resized.scale).toBeCloseTo(
      framing.camera.center.x,
    );
    expect((800 / 2 - resized.y) / resized.scale).toBeCloseTo(
      framing.camera.center.y,
    );
    expect(resized.scale).toBe(0.75);
  });

  it("rejects non-finite coordinates and out-of-range zoom", () => {
    expect(() =>
      storyCameraSchema.parse({
        version: 1,
        center: { x: Number.NaN, y: 0 },
        zoom: 1,
      }),
    ).toThrow();
    expect(() =>
      storyCameraSchema.parse({
        version: 1,
        center: { x: 0, y: 0 },
        zoom: 99,
      }),
    ).toThrow();
  });
});
