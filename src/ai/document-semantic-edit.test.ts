import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  applyDocumentSemanticUndo,
  buildValidatedDocumentEdit,
} from "@/ai/document-semantic-edit";
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
  const metadata = new Y.Map<unknown>();
  metadata.set("__type", "text");
  metadata.set("__format", 0);
  metadata.set("__style", "");
  metadata.set("__mode", 0);
  metadata.set("__detail", 0);
  paragraph.insertEmbed(0, metadata);
  paragraph.insert(1, "Alpha beta gamma");
  root.insertEmbed(0, paragraph);
  const range: DocumentRangeTarget = {
    documentObjectId: documentId,
    anchor: encodeDocumentRelativePosition(
      Y.createRelativePositionFromTypeIndex(paragraph, 7),
    ),
    head: encodeDocumentRelativePosition(
      Y.createRelativePositionFromTypeIndex(paragraph, 11),
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
          { kind: "replace_selection", text: "delta", format: "plain" },
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

    const laterParagraph = new Y.XmlText();
    laterParagraph.setAttribute("__type", "paragraph");
    const laterMetadata = new Y.Map<unknown>();
    laterMetadata.set("__type", "text");
    laterMetadata.set("__format", 0);
    laterParagraph.insertEmbed(0, laterMetadata);
    laterParagraph.insert(1, " human");
    getProductDocumentContentRoot(document, documentId).insertEmbed(
      1,
      laterParagraph,
    );
    const undo = applyDocumentSemanticUndo(document, edit.documentUndoPayload);
    expect(undo.conflicts).toEqual([]);
    expect(plainText(paragraph)).toBe("Alpha beta gamma");
    expect(plainText(laterParagraph)).toBe(" human");
  });

  it("preserves user-edited AI text and reports a semantic undo conflict", () => {
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
          { kind: "replace_selection", text: "delta", format: "plain" },
        ],
        whatChanged: "Replaced the selected phrase.",
        why: "The user requested clearer wording.",
      },
    });
    Y.applyUpdate(document, edit.tentativeUpdate);
    paragraph.delete(7, 5);
    paragraph.insert(7, "human delta");

    const undo = applyDocumentSemanticUndo(document, edit.documentUndoPayload);

    expect(undo.conflicts).toHaveLength(1);
    expect(plainText(paragraph)).toBe("Alpha human delta gamma");
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
