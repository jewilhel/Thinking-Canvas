import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { releaseDocumentCollabNodeCache } from "@/components/documents/product-document-collaboration";

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
