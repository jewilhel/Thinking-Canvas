import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { buildValidatedDocumentEdit } from "@/ai/document-semantic-edit";
import {
  createProductCanvasDocument,
  putCanvasObjectV2,
  readCanvasObjectV2,
} from "@/canvas/canvas-document";
import {
  encodeDocumentRelativePosition,
  type DocumentRangeTarget,
} from "@/documents/document-range";
import {
  createProductDocumentObject,
  getProductDocumentContentRoot,
} from "@/documents/product-document";

const canvasId = "20000000-0000-4000-8000-000000000001";
const documentId = "61000000-0000-4000-8000-000000000001";
const actorId = "10000000-0000-4000-8000-000000000001";

function plainText(text: Y.XmlText) {
  return text
    .toDelta()
    .flatMap((operation: { insert?: unknown }) =>
      typeof operation.insert === "string" ? [operation.insert] : [],
    )
    .join("");
}

function fixture() {
  const document = createProductCanvasDocument(canvasId);
  putCanvasObjectV2(
    document,
    createProductDocumentObject({
      canvasId,
      objectId: documentId,
      actorId,
      issuedAt: "2026-09-02T00:00:00.000Z",
      geometry: { x: 0, y: 0, width: 440, height: 560, rotation: 0 },
    }),
  );
  const root = getProductDocumentContentRoot(document, documentId);
  const paragraph = new Y.XmlText();
  paragraph.setAttribute("__type", "paragraph");
  paragraph.insert(0, "Alpha beta gamma");
  root.insertEmbed(0, paragraph);
  const range: DocumentRangeTarget = {
    documentObjectId: documentId,
    anchor: encodeDocumentRelativePosition(
      Y.createRelativePositionFromTypeIndex(paragraph, 6),
    ),
    head: encodeDocumentRelativePosition(
      Y.createRelativePositionFromTypeIndex(paragraph, 10),
    ),
    quote: "beta",
  };
  return { document, paragraph, range };
}

describe("semantic AI document editing", () => {
  it("creates one validated update and an inverse that preserves later human text", () => {
    const { document, paragraph, range } = fixture();
    const edit = buildValidatedDocumentEdit({
      document,
      canvasId,
      actorId,
      toolName: "stage_document_changes",
      range,
      arguments: {
        summary: "Clarify the selected phrase.",
        documentObjectId: documentId,
        operations: [
          { kind: "replace_selection", text: "delta", format: "bold" },
        ],
        whatChanged: "Replaced and emphasized the selected phrase.",
        why: "The user requested clearer wording.",
      },
    });
    Y.applyUpdate(document, edit.tentativeUpdate);
    expect(plainText(paragraph)).toBe("Alpha delta gamma");
    expect(readCanvasObjectV2(document, documentId)).toMatchObject({
      contentRevision: 1,
    });

    paragraph.insert(paragraph.length, " human");
    Y.applyUpdate(document, edit.documentUndoUpdate);
    expect(plainText(paragraph)).toBe("Alpha beta gamma human");
  });

  it("rejects a range or internal object outside the projected document", () => {
    const { document, range } = fixture();
    expect(() =>
      buildValidatedDocumentEdit({
        document,
        canvasId,
        actorId,
        toolName: "execute_document_changes",
        range: { ...range, documentObjectId: crypto.randomUUID() },
        arguments: {
          summary: "Unsafe edit.",
          documentObjectId: documentId,
          operations: [{ kind: "replace_selection", text: "unsafe" }],
          whatChanged: "Changed text.",
          why: "Requested.",
        },
      }),
    ).toThrow("does not match the comment range");
  });
});
