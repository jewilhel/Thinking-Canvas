import * as Y from "yjs";
import { LiveTranscript } from "@/voice/live-transcript";
import { availableTranscriptText } from "@/voice/conversation-transcript";
import { conversationDocumentArgumentsSchema } from "./tool-registry";
import { stableAiToolCommandId } from "./trusted-execution";
import {
  listCanvasObjectsV2,
  readCanvasObjectV2,
} from "@/canvas/canvas-document";
import { validateCanvasReviewStage } from "@/ai/proposals";
import {
  createProductDocumentObject,
  initializePlainTextDocument,
  getProductDocumentContentRoot,
} from "@/documents/product-document";

export const CONVERSATION_DOCUMENT_COVERAGE =
  "Source coverage: Generated from the conversation source supplied to Canvas AI. This is a synthesis, not a verbatim transcript. Provider captions may contain recognition errors.";

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
    commands: [{ type: "object.create", payload: { object } }],
  });
  const body = conversationDocumentBody(args, input.conversation);
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

export function conversationDocumentBody(
  args: {
    kind: string;
    text: string;
    sourceSession?: "current" | "previous" | null;
  },
  conversation?: string,
) {
  let body = args.text;
  if (args.kind === "transcript") {
    const parsed = JSON.parse(conversation ?? "{}");
    const source =
      args.sourceSession === "previous"
        ? parsed.previousSessionTranscript
        : parsed.sessionTranscript;
    if (args.sourceSession === "previous" && !source)
      throw new Error(
        "The previous conversation is not available in this tab.",
      );
    if (source) {
      if (
        typeof source.text !== "string" ||
        !source.text.trim() ||
        source.text.length > 100_000 ||
        !Array.isArray(source.gaps)
      )
        throw new Error("No valid session transcript is available to save.");
      if (
        source.gaps.some(
          (gap: unknown) =>
            typeof gap !== "string" ||
            /exceeded|could not be included/.test(gap),
        )
      )
        throw new Error(
          "The session transcript has missing text; it cannot be saved as a full transcript.",
        );
      return (
        (args.sourceSession === "previous"
          ? `Source: Captured wording from the previous voice conversation${typeof source.startedAt === "string" ? ` (${source.startedAt})` : ""}. `
          : "Source: Captured wording from this voice session up to this request. ") +
        "Provider captions may contain recognition errors or AI words that were interrupted.\n\n" +
        source.text
      );
    }
    if (!Array.isArray(parsed.fragments) || !parsed.fragments.length)
      throw new Error("No conversation wording is available to save.");
    const transcript = new LiveTranscript();
    parsed.fragments.forEach(
      (
        part: {
          speaker: string;
          text: string;
          startMs?: number;
          endMs?: number;
        },
        index: number,
      ) => {
        if (
          !["user", "assistant"].includes(part.speaker) ||
          typeof part.text !== "string"
        )
          throw new Error("Invalid conversation wording.");
        transcript.append(
          {
            type:
              part.speaker === "user"
                ? "session.input_transcript.delta"
                : "session.output_transcript.delta",
            event_id: String(index),
            delta: part.text,
            start_ms: part.startMs ?? index,
            end_ms: part.endMs ?? part.startMs ?? index,
          },
          "saved",
          0,
        );
      },
    );
    body = availableTranscriptText(transcript.snapshot());
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
  return body;
}
