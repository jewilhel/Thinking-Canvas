import * as Y from "yjs";
import { conversationDocumentArgumentsSchema } from "./tool-registry";
import { stableAiToolCommandId } from "./trusted-execution";
import {
  listCanvasObjectsV2,
  readCanvasObjectV2,
} from "@/canvas/canvas-document";
import { executeProductCanvasCommand } from "@/domain/canvas-command";
import {
  createProductDocumentObject,
  initializePlainTextDocument,
} from "@/documents/product-document";

export const CONVERSATION_DOCUMENT_COVERAGE =
  "Source coverage: Created from the recent conversation context available to Canvas AI. Earlier or missing discussion may not be included. This is a generated document, not a verbatim transcript.";

export async function buildConversationDocumentUpdate(input: {
  document: Y.Doc;
  canvasId: string;
  actorId: string;
  runId: string;
  callKey: string;
  arguments: unknown;
}) {
  const args = conversationDocumentArgumentsSchema.parse(input.arguments);
  const commandId = await stableAiToolCommandId(input);
  const objectId = await stableAiToolCommandId({
    runId: input.runId,
    callKey: `${input.callKey}:conversation-document`,
  });
  if (readCanvasObjectV2(input.document, objectId))
    throw new Error(
      "Conversation document already exists; reconcile the saved tool result.",
    );
  const objects = listCanvasObjectsV2(input.document);
  const x = objects.length
    ? Math.max(...objects.map((o) => o.geometry.x + o.geometry.width)) + 48
    : 0;
  const y = objects.length ? Math.min(...objects.map((o) => o.geometry.y)) : 0;
  const issuedAt = new Date().toISOString();
  const object = createProductDocumentObject({
    canvasId: input.canvasId,
    objectId,
    actorId: input.actorId,
    issuedAt,
    title: args.title,
    geometry: { x, y, width: 440, height: 560, rotation: 0 },
  });
  const next = new Y.Doc();
  try {
    Y.applyUpdate(next, Y.encodeStateAsUpdate(input.document));
    executeProductCanvasCommand(next, {
      schemaVersion: 2,
      commandId,
      canvasId: input.canvasId,
      actor: { id: input.actorId, type: "ai" },
      origin: "ai",
      issuedAt,
      type: "object.create",
      payload: { object },
    });
    initializePlainTextDocument(
      next,
      objectId,
      `${CONVERSATION_DOCUMENT_COVERAGE}\n\n${args.text}`,
    );
    return {
      commandId,
      objectId,
      title: args.title,
      affectedObjectIds: [objectId],
      update: Y.encodeStateAsUpdate(next, Y.encodeStateVector(input.document)),
    };
  } finally {
    next.destroy();
  }
}
