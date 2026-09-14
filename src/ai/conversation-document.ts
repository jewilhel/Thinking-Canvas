import * as Y from "yjs";
import { conversationDocumentArgumentsSchema } from "./tool-registry";
import { stableAiToolCommandId } from "./trusted-execution";
import {
  listCanvasObjectsV2,
  readCanvasObjectV2,
} from "@/canvas/canvas-document";
import { prepareVoiceCreationCommands } from "./voice-creation-layout";
import { validateCanvasReviewStage } from "@/ai/proposals";
import {
  createProductDocumentObject,
  initializePlainTextDocument,
  getProductDocumentContentRoot,
} from "@/documents/product-document";

export const CONVERSATION_DOCUMENT_COVERAGE =
  "Source coverage: Created from the recent conversation context available to Canvas AI. Earlier or missing discussion may not be included. This is a generated document, not a verbatim transcript.";

export async function documentContentHash(document: Y.Doc, objectId: string) {
  const text = JSON.stringify(
    getProductDocumentContentRoot(document, objectId).toJSON(),
  );
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function buildConversationDocumentUpdate(input: {
  document: Y.Doc;
  canvasId: string;
  actorId: string;
  runId: string;
  callKey: string;
  arguments: unknown;
  conversation?: string;
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
  const reviewStage = validateCanvasReviewStage({
    document: input.document,
    canvasId: input.canvasId,
    actorId: input.actorId,
    commands: prepareVoiceCreationCommands(
      [{ type: "object.create", payload: { object } }],
      objects,
    ),
  });
  let body = args.text;
  if (args.kind === "transcript") {
    const parsed = JSON.parse(input.conversation ?? "{}");
    if (!Array.isArray(parsed.fragments) || !parsed.fragments.length)
      throw new Error("No conversation wording is available to save.");
    body = parsed.fragments
      .map((part: { speaker: string; text: string }) => {
        if (
          !["user", "assistant"].includes(part.speaker) ||
          typeof part.text !== "string"
        )
          throw new Error("Invalid conversation wording.");
        return `${part.speaker === "user" ? "You" : "AI"}: ${part.text}`;
      })
      .join("\n\n");
    body =
      "Source coverage: This is the recent transcript available to Canvas AI, not a complete session recording. Earlier speech may be missing; AI text may include words that were interrupted.\n\n" +
      body;
  } else if (args.kind !== "document") {
    if (!body.trim())
      throw new Error(
        "A summary or brief needs substantive conversation content.",
      );
    body = `${CONVERSATION_DOCUMENT_COVERAGE}\n\n${body}`;
  }
  const next = new Y.Doc();
  try {
    Y.applyUpdate(next, Y.encodeStateAsUpdate(input.document));
    Y.applyUpdate(next, reviewStage.tentativeUpdate);
    if (body.trim()) initializePlainTextDocument(next, objectId, body);
    return {
      commandId,
      reviewStage,
      contentHash: await documentContentHash(next, objectId),
      objectId,
      title: args.title,
      affectedObjectIds: [objectId],
      update: Y.encodeStateAsUpdate(next, Y.encodeStateVector(input.document)),
    };
  } finally {
    next.destroy();
  }
}
