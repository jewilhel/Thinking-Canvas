import * as Y from "yjs";

import type { CanvasObjectV2 } from "@/canvas/canvas-document";
import {
  defaultDocumentSettings,
  documentContentRootName,
  documentSettingsSchema,
  type DocumentSettings,
} from "@/documents/document-schema";

const defaultDocumentStyle = {
  fill: "#ffffff",
  outline: "#d4d4d8",
  outlineWidth: 1,
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  fontSize: 16,
  fontWeight: "normal",
  textAlign: "left",
  listStyle: "none",
  linkUrl: null,
  textColor: "#18181b",
} as const;

export type ProductDocumentObject = Extract<
  CanvasObjectV2,
  { type: "document" }
>;

export function createProductDocumentObject({
  canvasId,
  objectId,
  documentId = objectId,
  actorId,
  issuedAt,
  title = "Untitled document",
  geometry,
  settings = defaultDocumentSettings,
}: {
  canvasId: string;
  objectId: string;
  documentId?: string;
  actorId: string;
  issuedAt: string;
  title?: string;
  geometry: ProductDocumentObject["geometry"];
  settings?: DocumentSettings;
}): ProductDocumentObject {
  return {
    schemaVersion: 2,
    id: objectId,
    canvasId,
    createdBy: actorId,
    createdAt: issuedAt,
    updatedAt: issuedAt,
    type: "document",
    documentId,
    documentVersion: 1,
    contentRevision: 0,
    title,
    geometry,
    style: defaultDocumentStyle,
    settings: documentSettingsSchema.parse(settings),
  };
}

export function getProductDocumentContentRoot(
  canvasDocument: Y.Doc,
  documentId: string,
) {
  return canvasDocument.get(
    documentContentRootName(documentId),
    Y.XmlText,
  ) as Y.XmlText;
}

export function hasProductDocumentContent(
  canvasDocument: Y.Doc,
  documentId: string,
) {
  return getProductDocumentContentRoot(canvasDocument, documentId).length > 0;
}

export function copyProductDocumentContent(
  canvasDocument: Y.Doc,
  sourceDocumentId: string,
  targetDocumentId: string,
) {
  if (sourceDocumentId === targetDocumentId) {
    throw new Error("A document cannot copy its content onto itself.");
  }
  const source = getProductDocumentContentRoot(
    canvasDocument,
    sourceDocumentId,
  );
  const target = getProductDocumentContentRoot(
    canvasDocument,
    targetDocumentId,
  );
  const delta = source
    .toDelta()
    .map(
      (operation: {
        insert: unknown;
        attributes?: Record<string, unknown>;
      }) => ({
        ...operation,
        insert:
          operation.insert instanceof Y.AbstractType
            ? operation.insert.clone()
            : operation.insert,
      }),
    );

  canvasDocument.transact(() => {
    if (target.length) target.delete(0, target.length);
    target.applyDelta(delta);
  }, "document.content.copy");
}

/** Initialize a new ordinary document from literal text, without interpreting markup. */
export function initializePlainTextDocument(
  canvasDocument: Y.Doc,
  documentId: string,
  text: string,
) {
  const root = getProductDocumentContentRoot(canvasDocument, documentId);
  if (root.length) throw new Error("Document already contains text.");
  if (!text.trim() || text.length > 120_000)
    throw new Error("Document text is empty or too large.");
  for (const line of text.split("\n")) {
    const paragraph = new Y.XmlText();
    paragraph.setAttribute("__type", "paragraph");
    const metadata = new Y.Map<unknown>();
    metadata.set("__type", "text");
    metadata.set("__format", 0);
    metadata.set("__style", "");
    metadata.set("__mode", 0);
    metadata.set("__detail", 0);
    paragraph.insertEmbed(0, metadata);
    if (line) paragraph.insert(1, line);
    root.insertEmbed(root.length, paragraph);
  }
}
