import { describe, expect, it } from "vitest";

import {
  commentRelativeTime,
  contextualCardPosition,
  threadAnchor,
} from "@/components/comments/canvas-comments";

describe("commentRelativeTime", () => {
  it("formats recent comment age for the marker preview", () => {
    const now = new Date("2026-08-20T23:00:00Z").getTime();
    expect(commentRelativeTime("2026-08-19T23:00:00Z", now)).toBe("1 day ago");
  });
});

describe("threadAnchor", () => {
  it("lets a world-space marker move beyond the viewport edge", () => {
    expect(
      threadAnchor(
        { targetObjectIds: [], canvasAnchor: { x: 100, y: 80 } },
        new Map(),
        { x: -240, y: -160, scale: 1 },
      ),
    ).toEqual({ left: -140, top: -80 });
  });
});

describe("contextualCardPosition", () => {
  it("places a thread beside its target when the right side has room", () => {
    expect(
      contextualCardPosition(
        { left: 312, top: 180 },
        { left: 100, top: 100, right: 300, bottom: 240 },
        { width: 1200, height: 800 },
        384,
        448,
      ),
    ).toEqual({ left: 316, top: 144 });
  });

  it("moves to the left instead of covering a right-edge target", () => {
    const position = contextualCardPosition(
      { left: 1112, top: 180 },
      { left: 900, top: 100, right: 1100, bottom: 240 },
      { width: 1200, height: 800 },
      384,
      448,
    );

    expect(position).toEqual({ left: 500, top: 144 });
    expect(position.left + 384).toBeLessThan(900);
  });

  it("uses vertical space when neither horizontal side can fit", () => {
    const position = contextualCardPosition(
      { left: 612, top: 130 },
      { left: 300, top: 100, right: 900, bottom: 220 },
      { width: 1200, height: 900 },
      384,
      448,
    );

    expect(position).toEqual({ left: 420, top: 236 });
    expect(position.top).toBeGreaterThan(220);
  });
});
