import * as Y from "yjs";

import { base64ToBytes, bytesToBase64 } from "@/collaboration/canvas-document";

export const DOCUMENT_RANGE_ANCHOR_MAX_LENGTH = 4_096;
export const DOCUMENT_RANGE_QUOTE_MAX_LENGTH = 1_000;
export const documentRangeReplacementsMapName = "document-range-replacements";

export type DocumentRangeTarget = {
  documentObjectId: string;
  anchor: string;
  head: string;
  quote: string;
};

export type ResolvedDocumentRange = {
  anchor: Y.AbsolutePosition | null;
  head: Y.AbsolutePosition | null;
  detached: boolean;
};

/** Range relocation travels atomically with the content update. SQL comments
 * keep their original anchors; readers follow relocations after an AI edit.
 */
export function currentDocumentRange<
  T extends { anchor: string; head: string; quote?: string },
>(document: Y.Doc, target: T): T {
  let current = target;
  const visited = new Set<string>();
  const replacements = document.getMap<unknown>(
    documentRangeReplacementsMapName,
  );
  for (let index = 0; index < 256; index += 1) {
    const key = JSON.stringify([current.anchor, current.head]);
    if (visited.has(key)) break;
    visited.add(key);
    const next = replacements.get(key);
    if (
      !next ||
      typeof next !== "object" ||
      !("anchor" in next) ||
      !("head" in next) ||
      !("quote" in next) ||
      typeof next.anchor !== "string" ||
      typeof next.head !== "string" ||
      typeof next.quote !== "string" ||
      next.anchor.length > DOCUMENT_RANGE_ANCHOR_MAX_LENGTH ||
      next.head.length > DOCUMENT_RANGE_ANCHOR_MAX_LENGTH ||
      next.quote.length > DOCUMENT_RANGE_QUOTE_MAX_LENGTH
    )
      break;
    current = {
      ...current,
      anchor: next.anchor,
      head: next.head,
      quote: next.quote,
    };
  }
  return current;
}

export function relocateDocumentRange(
  document: Y.Doc,
  before: Pick<DocumentRangeTarget, "anchor" | "head">,
  after: Pick<DocumentRangeTarget, "anchor" | "head" | "quote">,
) {
  document
    .getMap(documentRangeReplacementsMapName)
    .set(JSON.stringify([before.anchor, before.head]), after);
}

export function encodeDocumentRelativePosition(position: Y.RelativePosition) {
  const encoded = bytesToBase64(Y.encodeRelativePosition(position));
  if (encoded.length > DOCUMENT_RANGE_ANCHOR_MAX_LENGTH) {
    throw new Error("The document range anchor is too large.");
  }
  return encoded;
}

export function decodeDocumentRelativePosition(value: string) {
  if (!value || value.length > DOCUMENT_RANGE_ANCHOR_MAX_LENGTH) {
    throw new Error("The document range anchor is invalid.");
  }
  return Y.decodeRelativePosition(base64ToBytes(value));
}

export function resolveDocumentRange(
  document: Y.Doc,
  target: Pick<DocumentRangeTarget, "anchor" | "head"> &
    Partial<Pick<DocumentRangeTarget, "quote">>,
): ResolvedDocumentRange {
  try {
    target = currentDocumentRange(document, target);
    const anchor = Y.createAbsolutePositionFromRelativePosition(
      decodeDocumentRelativePosition(target.anchor),
      document,
    );
    const head = Y.createAbsolutePositionFromRelativePosition(
      decodeDocumentRelativePosition(target.head),
      document,
    );
    const collapsedAfterDeletion =
      Boolean(target.quote) &&
      anchor !== null &&
      head !== null &&
      anchor.type === head.type &&
      anchor.index === head.index;
    return {
      anchor,
      head,
      detached: anchor === null || head === null || collapsedAfterDeletion,
    };
  } catch {
    return { anchor: null, head: null, detached: true };
  }
}

export function boundedDocumentRangeQuote(value: string) {
  return value.trim().slice(0, DOCUMENT_RANGE_QUOTE_MAX_LENGTH);
}
