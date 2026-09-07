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
  resolveDocumentRange,
  currentDocumentRange,
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
  it.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ])(
    "replaces and re-edits a paragraph/list selection (backward=%s, boundary=%s)",
    (backward, boundary) => {
      const { document, paragraph } = fixture();
      const root = getProductDocumentContentRoot(document, documentId);
      const preceding = new Y.XmlText();
      preceding.setAttribute("__type", "paragraph");
      root.insertEmbed(0, preceding);
      preceding.insertEmbed(
        0,
        new Y.Map((paragraph.toDelta()[0]!.insert as Y.Map<unknown>).entries()),
      );
      preceding.insert(1, "Keep this introduction.");
      const list = new Y.XmlText();
      list.setAttribute("__type", "list");
      list.setAttribute("__listType", "bullet");
      list.setAttribute("__tag", "ul");
      list.setAttribute("__start", 1);
      root.insertEmbed(root.length, list);
      for (const value of ["First benefit", "Second benefit"]) {
        const item = new Y.XmlText();
        item.setAttribute("__type", "listitem");
        item.setAttribute("__value", 1);
        list.insertEmbed(list.length, item);
        const metadata = new Y.Map<unknown>();
        metadata.set("__type", "text");
        metadata.set("__format", 0);
        metadata.set("__style", "");
        metadata.set("__mode", 0);
        metadata.set("__detail", 0);
        item.insertEmbed(0, metadata);
        item.insert(1, value);
      }
      const lastItem = list.toDelta()[1]!.insert as Y.XmlText;
      const range: DocumentRangeTarget = {
        documentObjectId: documentId,
        anchor: encodeDocumentRelativePosition(
          Y.createRelativePositionFromTypeIndex(
            boundary ? preceding : paragraph,
            boundary ? preceding.length : 1,
          ),
        ),
        head: encodeDocumentRelativePosition(
          Y.createRelativePositionFromTypeIndex(lastItem, lastItem.length),
        ),
        quote: "Alpha beta gamma\nFirst benefit\nSecond benefit",
      };
      if (backward) [range.anchor, range.head] = [range.head, range.anchor];
      const edit = buildValidatedDocumentEdit({
        document,
        canvasId,
        actorId,
        range,
        toolName: "execute_document_changes",
        arguments: {
          summary: "Improve the introduction and benefits.",
          documentObjectId: documentId,
          operations: [
            {
              kind: "replace_selection",
              text: "What to expect:\n\n- Clear first benefit\n- Clear second benefit",
              format: "plain",
            },
          ],
          whatChanged: "Revised the selected section.",
          why: "Approved wording.",
        },
      });
      Y.applyUpdate(document, edit.tentativeUpdate);
      const blocks = root
        .toDelta()
        .map((entry: { insert?: unknown }) => entry.insert as Y.XmlText)
        .slice(1);
      expect(plainText(preceding)).toBe("Keep this introduction.");
      expect(plainText(blocks[0]!)).toBe("What to expect:");
      expect(blocks[1]!.getAttribute("__type")).toBe("list");
      expect(resolveDocumentRange(document, range).detached).toBe(false);
      expect(
        blocks[1]!
          .toDelta()
          .map((entry: { insert?: unknown }) =>
            plainText(entry.insert as Y.XmlText),
          ),
      ).toEqual(["Clear first benefit", "Clear second benefit"]);
      const followUp = buildValidatedDocumentEdit({
        document,
        canvasId,
        actorId,
        range,
        toolName: "execute_document_changes",
        arguments: {
          summary: "Shorten the revised section.",
          documentObjectId: documentId,
          operations: [
            {
              kind: "replace_selection",
              text: "Two benefits:\n\n- First\n- Second",
              format: "plain",
            },
          ],
          whatChanged: "Shortened the current text.",
          why: "Follow-up request.",
        },
      });
      Y.applyUpdate(document, followUp.tentativeUpdate);
      expect(resolveDocumentRange(document, range).detached).toBe(false);
      expect(currentDocumentRange(document, range).quote).toContain(
        "Two benefits:",
      );
      expect(plainText(preceding)).toBe("Keep this introduction.");
      expect(plainText(root.toDelta()[1]!.insert as Y.XmlText)).toBe(
        "Two benefits:",
      );
      applyDocumentSemanticUndo(document, followUp.documentUndoPayload);
      const undo = applyDocumentSemanticUndo(
        document,
        edit.documentUndoPayload,
      );
      expect(undo.conflicts).toEqual([]);
      expect(plainText(root.toDelta()[1]!.insert as Y.XmlText)).toBe(
        "Alpha beta gamma",
      );
    },
  );

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
