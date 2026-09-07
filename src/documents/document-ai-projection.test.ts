import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  createProductCanvasDocument,
  listCanvasObjectsV2,
  putCanvasObjectV2,
} from "@/canvas/canvas-document";
import { buildAiDocumentProjections } from "@/documents/document-ai-projection";
import {
  createProductDocumentObject,
  getProductDocumentContentRoot,
} from "@/documents/product-document";

const canvasId = "20000000-0000-4000-8000-000000000001";
const documentId = "61000000-0000-4000-8000-000000000001";
const actorId = "10000000-0000-4000-8000-000000000001";

describe("AI document projection", () => {
  it("projects bounded semantic blocks and document-owned relationships", () => {
    const document = createProductCanvasDocument(canvasId);
    putCanvasObjectV2(
      document,
      createProductDocumentObject({
        canvasId,
        objectId: documentId,
        actorId,
        issuedAt: "2026-09-02T00:00:00.000Z",
        title: "Plan",
        geometry: { x: 0, y: 0, width: 440, height: 560, rotation: 0 },
      }),
    );
    const heading = new Y.XmlText();
    heading.setAttribute("__type", "heading");
    heading.setAttribute("__tag", "h2");
    heading.insert(0, "Outcomes");
    getProductDocumentContentRoot(document, documentId).insertEmbed(0, heading);
    const list = new Y.XmlText();
    list.setAttribute("__type", "list");
    list.setAttribute("__listType", "bullet");
    const item = new Y.XmlText();
    item.setAttribute("__type", "listitem");
    item.insert(0, "Read ");
    const link = new Y.XmlText();
    link.setAttribute("__type", "link");
    link.insert(0, "the guide");
    item.insertEmbed(5, link);
    list.insertEmbed(0, item);
    getProductDocumentContentRoot(document, documentId).insertEmbed(1, list);
    putCanvasObjectV2(document, {
      schemaVersion: 2,
      id: "61000000-0000-4000-8000-000000000002",
      canvasId,
      createdBy: actorId,
      createdAt: "2026-09-02T00:00:00.000Z",
      updatedAt: "2026-09-02T00:00:00.000Z",
      type: "annotation",
      points: [0, 0, 10, 10],
      temporary: false,
      attachedObjectId: null,
      documentOwnerId: documentId,
      documentLocal: {
        x: 20,
        y: 40,
        width: 10,
        height: 10,
        rotation: 0,
        pageIndex: 0,
      },
      geometry: { x: 20, y: 40, width: 10, height: 10, rotation: 0 },
      style: {
        fill: "transparent",
        outline: "#7c3aed",
        outlineWidth: 2,
        fontFamily: "Inter",
        fontSize: 16,
        fontWeight: "normal",
        textAlign: "left",
        listStyle: "none",
        linkUrl: null,
        textColor: "#18181b",
      },
    });

    expect(
      buildAiDocumentProjections({
        document,
        objects: listCanvasObjectsV2(document),
      })[0],
    ).toMatchObject({
      objectId: documentId,
      title: "Plan",
      outline: [{ level: 2, text: "Outcomes" }],
      blocks: [
        { kind: "h2", text: "Outcomes" },
        { kind: "list", text: "- Read the guide" },
      ],
      internalObjects: [
        {
          id: "61000000-0000-4000-8000-000000000002",
          type: "annotation",
        },
      ],
    });
  });
});
