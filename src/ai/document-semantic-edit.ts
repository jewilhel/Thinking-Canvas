import * as Y from "yjs";

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

type DocumentEditToolName = Extract<
  AiToolName,
  | "propose_document_changes"
  | "stage_document_changes"
  | "execute_document_changes"
>;

const AI_DOCUMENT_ORIGIN = "ai.document.semantic";

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

function applyTextOperations(input: {
  document: Y.Doc;
  documentId: string;
  operations: ReturnType<
    typeof documentChangesArgumentsSchema.parse
  >["operations"];
  range: DocumentRangeTarget | null;
}) {
  const root = getProductDocumentContentRoot(input.document, input.documentId);
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
    anchor.type.delete(start, end - start);
    if (operation.text) {
      const child = textNode(operation.text, operation.format);
      anchor.type.insertEmbed(start, child.metadata);
      anchor.type.insert(start + 1, child.text);
    }
  }
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
  documentUndoUpdate: Uint8Array;
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
  edited.transact(
    () =>
      applyTextOperations({
        document: edited,
        documentId: documentObject.documentId,
        operations: args.operations,
        range: input.range,
      }),
    AI_DOCUMENT_ORIGIN,
  );
  const tentativeUpdate = Y.encodeStateAsUpdate(edited, stateVector);
  const afterVector = Y.encodeStateVector(edited);
  undoManager.undo();
  const documentUndoUpdate = Y.encodeStateAsUpdate(edited, afterVector);
  undoManager.destroy();
  if (documentUndoUpdate.length <= 2) {
    throw new Error(
      "The document edit did not create an undoable text change.",
    );
  }
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
    documentUndoUpdate,
  };
}
