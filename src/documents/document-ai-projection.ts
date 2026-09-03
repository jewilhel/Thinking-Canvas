import * as Y from "yjs";

import type { CanvasObjectV2 } from "@/canvas/canvas-document";
import { getProductDocumentContentRoot } from "@/documents/product-document";

export const AI_DOCUMENT_TEXT_MAX_LENGTH = 20_000;
export const AI_DOCUMENT_BLOCK_MAX_COUNT = 250;

export type AiDocumentProjection = {
  objectId: string;
  title: string;
  settings: {
    layout: string;
    pageSize: string | null;
    orientation: string | null;
  };
  outline: Array<{ level: number; text: string }>;
  blocks: Array<{ kind: string; text: string }>;
  internalObjects: Array<{
    id: string;
    type: string;
    summary: string;
    relationshipIds: string[];
  }>;
};

function objectSummary(object: CanvasObjectV2) {
  if (object.type === "shape") return object.text;
  if (object.type === "text") return object.text;
  if (object.type === "table") return object.cells.flat().join(" | ");
  if (object.type === "icon") return `Phosphor icon: ${object.iconName}`;
  if (object.type === "connector") return "Connector";
  if (object.type === "annotation")
    return `${object.temporary ? "Temporary" : "Promoted"} annotation`;
  return object.title;
}

function relationships(object: CanvasObjectV2) {
  if (object.type === "connector") {
    return [object.start, object.end].flatMap((endpoint) =>
      endpoint.kind === "attached" ? [endpoint.objectId] : [],
    );
  }
  if (object.type === "annotation" && object.attachedObjectId) {
    return [object.attachedObjectId];
  }
  if (object.type === "icon" && object.parentId) return [object.parentId];
  return [];
}

export function buildAiDocumentProjections(input: {
  document: Y.Doc;
  objects: CanvasObjectV2[];
}) {
  return input.objects.flatMap((object): AiDocumentProjection[] => {
    if (object.type !== "document") return [];
    const root = getProductDocumentContentRoot(
      input.document,
      object.documentId,
    );
    let remaining = AI_DOCUMENT_TEXT_MAX_LENGTH;
    const blocks: Array<{ kind: string; text: string }> = root
      .toDelta()
      .flatMap((operation: { insert?: unknown }) => {
        const value = operation.insert;
        if (!(value instanceof Y.XmlText) || remaining <= 0) return [];
        const text = value
          .toDelta()
          .flatMap((child: { insert?: unknown }) =>
            typeof child.insert === "string" ? [child.insert] : [],
          )
          .join("")
          .slice(0, remaining);
        remaining -= text.length;
        const kind = String(value.getAttribute("__type") ?? "paragraph");
        return [{ kind, text }];
      })
      .slice(0, AI_DOCUMENT_BLOCK_MAX_COUNT);
    const outline = blocks.flatMap((block: { kind: string; text: string }) => {
      const match = block.kind.match(/^h([1-6])$/);
      return match ? [{ level: Number(match[1]), text: block.text }] : [];
    });
    const internalObjects = input.objects
      .filter(
        (candidate) =>
          candidate.type !== "document" &&
          candidate.documentOwnerId === object.id,
      )
      .map((candidate) => ({
        id: candidate.id,
        type: candidate.type,
        summary: objectSummary(candidate).slice(0, 1_000),
        relationshipIds: relationships(candidate),
      }));
    return [
      {
        objectId: object.id,
        title: object.title.slice(0, 500),
        settings: {
          layout: object.settings.layout.mode,
          pageSize:
            object.settings.layout.mode === "paginated"
              ? object.settings.layout.pageSize
              : null,
          orientation:
            object.settings.layout.mode === "paginated"
              ? object.settings.layout.orientation
              : null,
        },
        outline,
        blocks,
        internalObjects,
      },
    ];
  });
}
