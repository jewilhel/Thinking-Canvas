import { describe, expect, it, vi } from "vitest";

import {
  interpolateViewport,
  startViewportTransition,
  viewportTransitionDuration,
} from "@/stories/story-transition";

const from = { x: 0, y: 0, scale: 1 };
const to = { x: 800, y: -400, scale: 2 };

describe("story viewport transitions", () => {
  it("keeps every frame within zoom endpoints and lands exactly at 300 percent", () => {
    const origin = { x: -1, y: 2, scale: 2.8 };
    const target = { x: -1751, y: -444, scale: 3 };
    for (let step = 0; step <= 1000; step++) {
      const frame = interpolateViewport(origin, target, step / 1000);
      expect(frame.scale).toBeGreaterThanOrEqual(2.8);
      expect(frame.scale).toBeLessThanOrEqual(3);
    }
    expect(interpolateViewport(origin, target, 1)).toEqual(target);
    expect(
      interpolateViewport(target, { ...origin, scale: 0.25 }, 1).scale,
    ).toBe(0.25);
  });
  it("uses bounded distance-aware timing", () => {
    expect(viewportTransitionDuration(from, from)).toBe(320);
    expect(viewportTransitionDuration(from, to)).toBeGreaterThan(320);
    expect(
      viewportTransitionDuration(from, { x: 100000, y: 0, scale: 4 }),
    ).toBe(950);
  });

  it("interpolates exact endpoints with positive geometric zoom", () => {
    expect(interpolateViewport(from, to, 0)).toEqual(from);
    expect(interpolateViewport(from, to, 1)).toEqual(to);
    expect(interpolateViewport(from, to, 0.5).scale).toBeCloseTo(Math.sqrt(2));
  });

  it("finishes immediately when reduced motion is requested", () => {
    const onUpdate = vi.fn();
    const onComplete = vi.fn();
    startViewportTransition({
      from,
      to,
      reducedMotion: true,
      onUpdate,
      onComplete,
    });
    expect(onUpdate).toHaveBeenCalledWith(to);
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("cancels an in-flight transition without completing", () => {
    let callback: FrameRequestCallback | null = null;
    const cancelFrame = vi.fn();
    const onComplete = vi.fn();
    const transition = startViewportTransition({
      from,
      to,
      reducedMotion: false,
      onUpdate: vi.fn(),
      onComplete,
      requestFrame: (next) => {
        callback = next;
        return 12;
      },
      cancelFrame,
    });
    transition.cancel();
    expect(cancelFrame).toHaveBeenCalledWith(12);
    (callback as FrameRequestCallback | null)?.(500);
    expect(onComplete).not.toHaveBeenCalled();
  });
});
