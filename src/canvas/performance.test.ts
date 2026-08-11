// @vitest-environment node

import { describe, expect, it } from "vitest";

import { summarizeFrameTimes } from "@/canvas/performance";

describe("frame measurement", () => {
  it("reports percentile, average fps, and sustained degradation", () => {
    expect(
      summarizeFrameTimes(Array.from({ length: 20 }, () => 40)),
    ).toMatchObject({
      sampleCount: 20,
      averageFps: 25,
      p95FrameTimeMs: 40,
      sustainedBelow30Fps: true,
    });
    expect(summarizeFrameTimes([16, 17, 16, 18])).toMatchObject({
      sampleCount: 4,
      sustainedBelow30Fps: false,
    });
  });
});
