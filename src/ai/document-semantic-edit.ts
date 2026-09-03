import * as Y from "yjs";
import { z } from "zod";

import {
  documentChangesArgumentsSchema,
  type AiToolName,
} from "@/ai/tool-registry";
import {
  validateCanvasReviewStage,
  type ValidatedCanvasReviewStage,
} from "@/ai/proposals";
import {
  listCanvasObjectsV2,
  readCanvasObjectV2,
} from "@/canvas/canvas-document";
import { getProductDocumentContentRoot } from "@/documents/product-document";
import {
  decodeDocumentRelativePosition,
  type DocumentRangeTarget,
} from "@/documents/document-range";
import { base64ToBytes, bytesToBase64 } from "@/collaboration/canvas-document";

type DocumentEditToolName = Extract<
  AiToolName,
  | "propose_document_changes"
  | "stage_document_changes"
  | "execute_document_changes"
>;

const AI_DOCUMENT_ORIGIN = "ai.document.semantic";
const DOCUMENT_UNDO_CONTEXT_LENGTH = 128;

const documentUndoPayloadSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    version: z.literal(1),
    kind: z.literal("replace_selection"),
    documentId: z.string().min(1).max(500),
    beforeText: z.string().max(100_000),
    afterText: z.string().max(100_000),
    leftContext: z.string().max(DOCUMENT_UNDO_CONTEXT_LENGTH),
    rightContext: z.string().max(DOCUMENT_UNDO_CONTEXT_LENGTH),
  }),
  z.strictObject({
    version: z.literal(1),
    kind: z.literal("yjs_update"),
    update: z.string().min(1).max(14_000_000),
  }),
]);

type DocumentUndoPayload = z.infer<typeof documentUndoPayloadSchema>;

function encodeDocumentUndoPayload(payload: DocumentUndoPayload) {
  return new TextEncoder().encode(JSON.stringify(payload));
}

function xmlTextContent(xmlText: Y.XmlText) {
  return xmlText
    .toDelta()
    .flatMap((operation: { insert?: unknown }) =>
      typeof operation.insert === "string" ? [operation.insert] : [],
    )
    .join("");
}

function xmlTextSlice(xmlText: Y.XmlText, start: number, end: number) {
  let offset = 0;
  let value = "";
  for (const operation of xmlText.toDelta() as Array<{ insert?: unknown }>) {
    const insert = operation.insert;
    if (typeof insert === "string") {
      const localStart = Math.max(0, start - offset);
      const localEnd = Math.min(insert.length, end - offset);
      if (localEnd > localStart) value += insert.slice(localStart, localEnd);
      offset += insert.length;
    } else {
      offset += 1;
    }
  }
  return value;
}

function visibleOffsetAt(xmlText: Y.XmlText, targetIndex: number) {
  let yOffset = 0;
  let visibleOffset = 0;
  for (const operation of xmlText.toDelta() as Array<{ insert?: unknown }>) {
    const insert = operation.insert;
    const length = typeof insert === "string" ? insert.length : 1;
    if (targetIndex <= yOffset + length) {
      return (
        visibleOffset +
        (typeof insert === "string" ? Math.max(0, targetIndex - yOffset) : 0)
      );
    }
    yOffset += length;
    if (typeof insert === "string") visibleOffset += insert.length;
  }
  return visibleOffset;
}

function yIndexAtVisibleOffset(xmlText: Y.XmlText, targetOffset: number) {
  let yOffset = 0;
  let visibleOffset = 0;
  for (const operation of xmlText.toDelta() as Array<{ insert?: unknown }>) {
    const insert = operation.insert;
    if (typeof insert === "string") {
      if (targetOffset <= visibleOffset + insert.length) {
        return yOffset + targetOffset - visibleOffset;
      }
      visibleOffset += insert.length;
      yOffset += insert.length;
    } else {
      yOffset += 1;
    }
  }
  return yOffset;
}

function documentTextBlocks(root: Y.XmlText) {
  return root
    .toDelta()
    .flatMap((operation: { insert?: unknown }) =>
      operation.insert instanceof Y.XmlText ? [operation.insert] : [],
    );
}

function formatFlags(format: "plain" | "bold" | "italic" | "bold_italic") {
  if (format === "bold") return 1;
  if (format === "italic") return 2;
  if (format === "bold_italic") return 3;
  return 0;
}

function textNode(
  text: string,
  format: "plain" | "bold" | "italic" | "bold_italic",
) {
  const metadata = new Y.Map<unknown>();
  metadata.set("__type", "text");
  metadata.set("__format", formatFlags(format));
  metadata.set("__style", "");
  metadata.set("__mode", 0);
  metadata.set("__detail", 0);
  return { metadata, text };
}

function blockNode(block: {
  kind: string;
  text: string;
  format: "plain" | "bold" | "italic" | "bold_italic";
}) {
  const blockNode = new Y.XmlText();
  blockNode.setAttribute(
    "__type",
    block.kind.startsWith("heading")
      ? `h${block.kind.slice("heading".length)}`
      : "paragraph",
  );
  const child = textNode(block.text, block.format);
  blockNode.insertEmbed(0, child.metadata);
  if (child.text) blockNode.insert(1, child.text);
  return blockNode;
}

function textFormatAt(xmlText: Y.XmlText, index: number) {
  let offset = 0;
  let format: number | null = null;
  for (const operation of xmlText.toDelta() as Array<{ insert?: unknown }>) {
    const insert = operation.insert;
    if (insert instanceof Y.Map) {
      if (offset > index) break;
      format =
        insert.get("__type") === "text" &&
        typeof insert.get("__format") === "number"
          ? (insert.get("__format") as number)
          : null;
      offset += 1;
      continue;
    }
    if (typeof insert === "string") {
      if (index <= offset + insert.length) return format;
      offset += insert.length;
    }
  }
  return format;
}

function applyTextOperations(input: {
  document: Y.Doc;
  documentId: string;
  operations: ReturnType<
    typeof documentChangesArgumentsSchema.parse
  >["operations"];
  range: DocumentRangeTarget | null;
}) {
  const root = getProductDocumentContentRoot(input.document, input.documentId);
  let selectionUndo: Extract<
    DocumentUndoPayload,
    { kind: "replace_selection" }
  > | null = null;
  for (const operation of input.operations) {
    if (operation.kind === "replace_document") {
      if (root.length) root.delete(0, root.length);
      for (const block of operation.blocks) {
        root.insertEmbed(root.length, blockNode(block));
      }
      continue;
    }
    if (operation.kind === "append_block") {
      root.insertEmbed(root.length, blockNode(operation.block));
      continue;
    }
    if (!input.range) {
      throw new Error(
        "A selected-range edit requires a document range comment.",
      );
    }
    const anchor = Y.createAbsolutePositionFromRelativePosition(
      decodeDocumentRelativePosition(input.range.anchor),
      input.document,
    );
    const head = Y.createAbsolutePositionFromRelativePosition(
      decodeDocumentRelativePosition(input.range.head),
      input.document,
    );
    if (
      !anchor ||
      !head ||
      anchor.type !== head.type ||
      !(anchor.type instanceof Y.XmlText)
    ) {
      throw new Error(
        "The selected document range is detached or crosses blocks.",
      );
    }
    const start = Math.min(anchor.index, head.index);
    const end = Math.max(anchor.index, head.index);
    if (start === end)
      throw new Error("The selected document range is detached.");
    const existingFormat = textFormatAt(anchor.type, start);
    const fullText = xmlTextContent(anchor.type);
    const visibleStart = visibleOffsetAt(anchor.type, start);
    const visibleEnd = visibleOffsetAt(anchor.type, end);
    selectionUndo = {
      version: 1,
      kind: "replace_selection",
      documentId: input.documentId,
      beforeText: xmlTextSlice(anchor.type, start, end),
      afterText: operation.text,
      leftContext: fullText.slice(
        Math.max(0, visibleStart - DOCUMENT_UNDO_CONTEXT_LENGTH),
        visibleStart,
      ),
      rightContext: fullText.slice(
        visibleEnd,
        visibleEnd + DOCUMENT_UNDO_CONTEXT_LENGTH,
      ),
    };
    anchor.type.delete(start, end - start);
    if (operation.text) {
      if (existingFormat === formatFlags(operation.format)) {
        anchor.type.insert(start, operation.text);
      } else {
        const child = textNode(operation.text, operation.format);
        anchor.type.insertEmbed(start, child.metadata);
        anchor.type.insert(start + 1, child.text);
      }
    }
  }
  return selectionUndo;
}

export function applyDocumentSemanticUndo(
  document: Y.Doc,
  encodedPayload: Uint8Array,
) {
  const payload = documentUndoPayloadSchema.parse(
    JSON.parse(new TextDecoder().decode(encodedPayload)),
  );
  if (payload.kind === "yjs_update") {
    Y.applyUpdate(document, base64ToBytes(payload.update));
    return { conflicts: [] as string[] };
  }
  const root = getProductDocumentContentRoot(document, payload.documentId);
  const candidates: Array<{
    block: Y.XmlText;
    start: number;
    end: number;
  }> = [];
  for (const block of documentTextBlocks(root)) {
    const text = xmlTextContent(block);
    if (payload.afterText) {
      let offset = text.indexOf(payload.afterText);
      while (offset >= 0) {
        const leftMatches =
          !payload.leftContext ||
          text.slice(
            Math.max(0, offset - payload.leftContext.length),
            offset,
          ) === payload.leftContext;
        const rightStart = offset + payload.afterText.length;
        const rightMatches =
          !payload.rightContext ||
          text.slice(rightStart, rightStart + payload.rightContext.length) ===
            payload.rightContext;
        if (leftMatches && rightMatches) {
          candidates.push({
            block,
            start: yIndexAtVisibleOffset(block, offset),
            end: yIndexAtVisibleOffset(block, rightStart),
          });
        }
        offset = text.indexOf(payload.afterText, offset + 1);
      }
    } else {
      const boundary = `${payload.leftContext}${payload.rightContext}`;
      const offset = boundary ? text.indexOf(boundary) : -1;
      if (offset >= 0 && text.indexOf(boundary, offset + 1) < 0) {
        const insertionOffset = offset + payload.leftContext.length;
        const yIndex = yIndexAtVisibleOffset(block, insertionOffset);
        candidates.push({ block, start: yIndex, end: yIndex });
      }
    }
  }
  if (candidates.length !== 1) {
    return {
      conflicts: [
        "document.content: the AI-authored text was changed or was not unique",
      ],
    };
  }
  const candidate = candidates[0]!;
  document.transact(() => {
    if (candidate.end > candidate.start) {
      candidate.block.delete(candidate.start, candidate.end - candidate.start);
    }
    if (payload.beforeText) {
      candidate.block.insert(candidate.start, payload.beforeText);
    }
  }, "ai.document.semantic.undo");
  return { conflicts: [] as string[] };
}

function assertInternalObjectScope(
  documentObjectId: string,
  document: Y.Doc,
  objectIds: string[],
) {
  for (const objectId of objectIds) {
    const object = readCanvasObjectV2(document, objectId);
    if (
      !object ||
      object.type === "document" ||
      object.documentOwnerId !== documentObjectId
    ) {
      throw new Error(
        "A document object action referenced an object outside the document.",
      );
    }
  }
}

export type ValidatedDocumentEdit = ValidatedCanvasReviewStage & {
  documentObjectId: string;
  documentUndoPayload: Uint8Array;
};

export function buildValidatedDocumentEdit(input: {
  document: Y.Doc;
  canvasId: string;
  actorId: string;
  toolName: DocumentEditToolName;
  arguments: unknown;
  range: DocumentRangeTarget | null;
}): ValidatedDocumentEdit {
  const args = documentChangesArgumentsSchema.parse(input.arguments);
  const documentObject = readCanvasObjectV2(
    input.document,
    args.documentObjectId,
  );
  if (
    !documentObject ||
    documentObject.type !== "document" ||
    documentObject.canvasId !== input.canvasId
  ) {
    throw new Error("The requested document is outside the current canvas.");
  }
  if (input.range && input.range.documentObjectId !== args.documentObjectId) {
    throw new Error("The requested document does not match the comment range.");
  }
  const objectIds = args.objectCommands.flatMap((command) => {
    if ("objectId" in command.payload) return [command.payload.objectId];
    if ("objectIds" in command.payload) return command.payload.objectIds;
    return [];
  });
  assertInternalObjectScope(args.documentObjectId, input.document, objectIds);
  const commands = [
    {
      type: "document.update" as const,
      payload: {
        objectId: args.documentObjectId,
        contentRevision: (documentObject.contentRevision ?? 0) + 1,
        ...(args.settings ? { settings: args.settings } : {}),
      },
    },
    ...args.objectCommands,
  ];
  const review = validateCanvasReviewStage({
    document: input.document,
    canvasId: input.canvasId,
    actorId: input.actorId,
    commands,
  });
  const stateVector = Y.encodeStateVector(input.document);
  const edited = new Y.Doc();
  Y.applyUpdate(edited, Y.encodeStateAsUpdate(input.document));
  Y.applyUpdate(edited, review.tentativeUpdate);
  const root = getProductDocumentContentRoot(edited, documentObject.documentId);
  const undoManager = new Y.UndoManager(root, {
    trackedOrigins: new Set([AI_DOCUMENT_ORIGIN]),
  });
  let selectionUndo: ReturnType<typeof applyTextOperations> = null;
  edited.transact(() => {
    selectionUndo = applyTextOperations({
      document: edited,
      documentId: documentObject.documentId,
      operations: args.operations,
      range: input.range,
    });
  }, AI_DOCUMENT_ORIGIN);
  const tentativeUpdate = Y.encodeStateAsUpdate(edited, stateVector);
  const afterVector = Y.encodeStateVector(edited);
  undoManager.undo();
  const fallbackUndoUpdate = Y.encodeStateAsUpdate(edited, afterVector);
  undoManager.destroy();
  if (fallbackUndoUpdate.length <= 2) {
    throw new Error(
      "The document edit did not create an undoable text change.",
    );
  }
  const documentUndoPayload = encodeDocumentUndoPayload(
    selectionUndo ?? {
      version: 1,
      kind: "yjs_update",
      update: bytesToBase64(fallbackUndoUpdate),
    },
  );
  return {
    ...review,
    commands: commands.map((command) => ({
      ...command,
      schemaVersion: 2 as const,
    })) as ValidatedCanvasReviewStage["commands"],
    commandTypes: commands.map((command) => command.type),
    affectedObjectIds: [
      ...new Set([...review.affectedObjectIds, args.documentObjectId]),
    ],
    tentativeUpdate,
    visualObjects: listCanvasObjectsV2(edited),
    documentObjectId: args.documentObjectId,
    documentUndoPayload,
  };
}
