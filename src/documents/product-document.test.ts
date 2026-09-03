import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { createProductCanvasDocument } from "@/canvas/canvas-document";
import {
  defaultDocumentSettings,
  documentContentRootName,
  documentSettingsSchema,
} from "@/documents/document-schema";
import {
  createProductDocumentObject,
  getProductDocumentContentRoot,
  hasProductDocumentContent,
} from "@/documents/product-document";
import { executeProductCanvasCommand } from "@/domain/canvas-command";

const canvasId = "20000000-0000-4000-8000-000000000001";
const actorId = "10000000-0000-4000-8000-000000000001";
const documentId = "70000000-0000-4000-8000-000000000001";

describe("product document model", () => {
  it("creates a first-version continuous document with stable defaults", () => {
    expect(
      createProductDocumentObject({
        canvasId,
        objectId: documentId,
        actorId,
        issuedAt: "2026-09-02T00:00:00.000Z",
        geometry: { x: 80, y: 120, width: 480, height: 640, rotation: 0 },
      }),
    ).toMatchObject({
      type: "document",
      documentId,
      documentVersion: 1,
      title: "Untitled document",
      settings: defaultDocumentSettings,
    });
  });

  it("accepts only approved document layouts and presentation tokens", () => {
    expect(
      documentSettingsSchema.parse({
        schemaVersion: 1,
        background: "#fef3c7",
        displayFont: "serif",
        readingSize: "large",
        layout: {
          mode: "paginated",
          pageSize: "a4",
          orientation: "landscape",
        },
      }),
    ).toMatchObject({ layout: { mode: "paginated", pageSize: "a4" } });
    expect(() =>
      documentSettingsSchema.parse({
        ...defaultDocumentSettings,
        layout: { mode: "paginated", pageSize: "legal" },
      }),
    ).toThrow();

    expect(() =>
      documentSettingsSchema.parse({
        ...defaultDocumentSettings,
        background: "url(javascript:alert(1))",
      }),
    ).toThrow();
  });

  it("stores structured Lexical collaboration state inside the canvas Y.Doc", () => {
    const source = createProductCanvasDocument(canvasId);
    const root = getProductDocumentContentRoot(source, documentId);
    const paragraph = new Y.XmlText();
    paragraph.setAttribute("__type", "paragraph");
    paragraph.insert(0, "Durable document text");
    root.insertEmbed(0, paragraph);

    expect(hasProductDocumentContent(source, documentId)).toBe(true);
    expect(documentContentRootName(documentId)).toContain(documentId);

    const peer = new Y.Doc();
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(source));
    expect(getProductDocumentContentRoot(peer, documentId).toJSON()).toEqual(
      root.toJSON(),
    );
  });

  it("converges document metadata and body changes after disconnected edits", () => {
    const source = createProductCanvasDocument(canvasId);
    const object = createProductDocumentObject({
      canvasId,
      objectId: documentId,
      actorId,
      issuedAt: "2026-09-02T00:00:00.000Z",
      title: "Shared outline",
      geometry: { x: 80, y: 120, width: 480, height: 640, rotation: 0 },
    });
    executeProductCanvasCommand(source, {
      schemaVersion: 2,
      commandId: "90000000-0000-4000-8000-000000000001",
      canvasId,
      actor: { id: actorId, type: "human" },
      origin: "human",
      issuedAt: "2026-09-02T00:00:00.000Z",
      type: "object.create",
      payload: { object },
    });
    const initial = Y.encodeStateAsUpdate(source);
    const left = new Y.Doc();
    const right = new Y.Doc();
    Y.applyUpdate(left, initial);
    Y.applyUpdate(right, initial);

    executeProductCanvasCommand(left, {
      schemaVersion: 2,
      commandId: "90000000-0000-4000-8000-000000000002",
      canvasId,
      actor: { id: actorId, type: "human" },
      origin: "human",
      issuedAt: "2026-09-02T00:01:00.000Z",
      type: "document.update",
      payload: { objectId: documentId, title: "Reconnected outline" },
    });
    getProductDocumentContentRoot(right, documentId).insert(
      0,
      "Concurrent body",
    );

    const leftUpdate = Y.encodeStateAsUpdate(left);
    const rightUpdate = Y.encodeStateAsUpdate(right);
    Y.applyUpdate(left, rightUpdate);
    Y.applyUpdate(right, leftUpdate);
    Y.applyUpdate(right, leftUpdate);

    expect(Y.encodeStateAsUpdate(left)).toEqual(Y.encodeStateAsUpdate(right));
    expect(getProductDocumentContentRoot(left, documentId).toString()).toBe(
      "Concurrent body",
    );
  });
});
