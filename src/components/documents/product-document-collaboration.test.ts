import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  commentThreadIdAtSelection,
  releaseDocumentCollabNodeCache,
} from "@/components/documents/product-document-collaboration";

type SharedTypeWithCache = object & { _collabNode?: unknown };

describe("releaseDocumentCollabNodeCache", () => {
  it("releases retained Lexical wrappers throughout a document tree", () => {
    const document = new Y.Doc();
    const root = document.get("document", Y.XmlText);
    const paragraph = new Y.XmlText();
    const text = new Y.Map();
    text.set("__type", "text");
    paragraph.insertEmbed(0, text);
    paragraph.insert(1, "Stable text");
    root.insertEmbed(0, paragraph);

    for (const sharedType of [root, paragraph, text]) {
      (sharedType as SharedTypeWithCache)._collabNode = { retained: true };
    }

    releaseDocumentCollabNodeCache(root);

    for (const sharedType of [root, paragraph, text]) {
      expect("_collabNode" in sharedType).toBe(false);
    }
  });
});

describe("commentThreadIdAtSelection", () => {
  it("returns the open thread whose durable DOM range contains the caret", () => {
    const anchorNode = document.createTextNode("Highlighted text");
    const selection = {
      isCollapsed: true,
      anchorNode,
      anchorOffset: 6,
      rangeCount: 1,
    } as unknown as Selection;
    const firstRange = {
      isPointInRange: () => false,
    } as unknown as Range;
    const matchingRange = {
      isPointInRange: (node: Node, offset: number) =>
        node === anchorNode && offset === 6,
    } as unknown as Range;

    expect(
      commentThreadIdAtSelection(
        selection,
        new Map([
          ["first-thread", firstRange],
          ["matching-thread", matchingRange],
        ]),
      ),
    ).toBe("matching-thread");
  });

  it("does not open a thread while the user is selecting text", () => {
    const selection = {
      isCollapsed: false,
      anchorNode: document.createTextNode("Selected text"),
      anchorOffset: 2,
      rangeCount: 1,
    } as unknown as Selection;

    expect(commentThreadIdAtSelection(selection, new Map())).toBeNull();
  });
});
