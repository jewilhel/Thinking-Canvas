import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  boundedDocumentRangeQuote,
  encodeDocumentRelativePosition,
  resolveDocumentRange,
} from "@/documents/document-range";

describe("document range anchors", () => {
  it("tracks a selected range through concurrent text insertion", () => {
    const left = new Y.Doc();
    const text = left.getText("body");
    text.insert(0, "Alpha beta gamma");
    const target = {
      anchor: encodeDocumentRelativePosition(
        Y.createRelativePositionFromTypeIndex(text, 6),
      ),
      head: encodeDocumentRelativePosition(
        Y.createRelativePositionFromTypeIndex(text, 10),
      ),
    };
    const right = new Y.Doc();
    Y.applyUpdate(right, Y.encodeStateAsUpdate(left));
    right.getText("body").insert(0, "Start ");
    Y.applyUpdate(left, Y.encodeStateAsUpdate(right));
    Y.applyUpdate(right, Y.encodeStateAsUpdate(left));

    const resolved = resolveDocumentRange(left, target);
    expect(resolved.detached).toBe(false);
    expect(resolved.anchor?.index).toBe(12);
    expect(resolved.head?.index).toBe(16);
    expect(Y.encodeStateAsUpdate(left)).toEqual(Y.encodeStateAsUpdate(right));
  });

  it("keeps deleted ranges as detached history", () => {
    const document = new Y.Doc();
    const text = document.getText("body");
    text.insert(0, "Delete me");
    const target = {
      anchor: encodeDocumentRelativePosition(
        Y.createRelativePositionFromTypeIndex(text, 0),
      ),
      head: encodeDocumentRelativePosition(
        Y.createRelativePositionFromTypeIndex(text, text.length),
      ),
      quote: "Delete me",
    };
    text.delete(0, text.length);

    expect(resolveDocumentRange(document, target).detached).toBe(true);
  });

  it("bounds quoted text without retaining surrounding content", () => {
    expect(boundedDocumentRangeQuote(`  ${"a".repeat(1_100)}  `)).toHaveLength(
      1_000,
    );
  });
});
