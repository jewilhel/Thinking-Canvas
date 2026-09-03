import * as Y from "yjs";

import { base64ToBytes, bytesToBase64 } from "@/collaboration/canvas-document";

export const DOCUMENT_RANGE_ANCHOR_MAX_LENGTH = 4_096;
export const DOCUMENT_RANGE_QUOTE_MAX_LENGTH = 1_000;

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
