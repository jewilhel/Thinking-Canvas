// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  applyCanvasUpdate,
  createCanvasDocument,
  encodeCanvasState,
  hashCanvasState,
  listCanvasObjects,
  putCanvasObject,
} from "@/collaboration/canvas-document";
import { captureUpdate, shape } from "@/collaboration/test-fixtures";

describe("renderer-independent canvas document", () => {
  it("converges after simultaneous updates are reordered and repeated", async () => {
    const source = createCanvasDocument();
    const first = captureUpdate(source, () =>
      putCanvasObject(
        source,
        shape("50000000-0000-4000-8000-000000000001", "First"),
      ),
    );
    const secondSource = createCanvasDocument();
    const second = captureUpdate(secondSource, () =>
      putCanvasObject(
        secondSource,
        shape("50000000-0000-4000-8000-000000000002", "Second"),
      ),
    );

    const left = createCanvasDocument();
    const right = createCanvasDocument();
    [first, second, first].forEach((update) => applyCanvasUpdate(left, update));
    [second, first, second].forEach((update) =>
      applyCanvasUpdate(right, update),
    );

    expect(
      listCanvasObjects(left).map((object) =>
        "text" in object ? object.text : object.type,
      ),
    ).toEqual(["First", "Second"]);
    expect(await hashCanvasState(left)).toBe(await hashCanvasState(right));
    expect(encodeCanvasState(left)).toEqual(encodeCanvasState(right));
  });
});
