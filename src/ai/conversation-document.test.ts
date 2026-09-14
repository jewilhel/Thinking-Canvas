import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import {
  buildConversationDocumentUpdate,
  CONVERSATION_DOCUMENT_COVERAGE,
  documentContentHash,
} from "./conversation-document";
import {
  createProductCanvasDocument,
  readCanvasObjectV2,
  listCanvasObjectsV2,
} from "@/canvas/canvas-document";
import { getProductDocumentContentRoot } from "@/documents/product-document";
import { buildUndoAiChangeSetUpdate } from "@/ai/review-state";
import { executeProductCanvasCommand } from "@/domain/canvas-command";
const canvasId = "20000000-0000-4000-8000-000000000001";
const actorId = "10000000-0000-4000-8000-000000000001";
const runId = "80000000-0000-4000-8000-000000000001";

describe("requested conversation document", () => {
  it.each(["summary", "design_brief"])(
    "persists %s body and coverage with ordinary deletion",
    async (kind) => {
      const document = createProductCanvasDocument(canvasId);
      const input = {
        document,
        canvasId,
        actorId,
        runId,
        callKey: "save-one",
        arguments: {
          kind,
          title: "Canvas discussion",
          text: "Agreed decisions\nUse green for ready items.\n\nOpen questions\nWhich labels should we use?",
        },
      };
      const result = await buildConversationDocumentUpdate(input);
      expect(listCanvasObjectsV2(document)).toHaveLength(0);
      const retry = await buildConversationDocumentUpdate(input);
      expect(retry.commandId).toBe(result.commandId);
      expect(retry.objectId).toBe(result.objectId);
      Y.applyUpdate(document, result.update);
      Y.applyUpdate(document, result.update);
      expect(listCanvasObjectsV2(document)).toHaveLength(1);
      const reloaded = createProductCanvasDocument(canvasId);
      Y.applyUpdate(reloaded, Y.encodeStateAsUpdate(document));
      expect(readCanvasObjectV2(reloaded, result.objectId)).toMatchObject({
        type: "document",
        title: "Canvas discussion",
        documentId: result.objectId,
      });
      const paragraphs = getProductDocumentContentRoot(
        reloaded,
        result.objectId,
      )
        .toDelta()
        .map((d: { insert?: unknown }) => d.insert)
        .filter((v: unknown): v is Y.XmlText => v instanceof Y.XmlText);
      const text = paragraphs
        .map((p: Y.XmlText) =>
          p
            .toDelta()
            .map((d: { insert?: unknown }) =>
              typeof d.insert === "string" ? d.insert : "",
            )
            .join(""),
        )
        .join("\n");
      expect(text).toBe(
        `${CONVERSATION_DOCUMENT_COVERAGE}\n\n${input.arguments.text}`,
      );
      await expect(
        buildConversationDocumentUpdate({ ...input, document: reloaded }),
      ).rejects.toThrow("already exists");
      executeProductCanvasCommand(reloaded, {
        schemaVersion: 2,
        commandId: "90000000-0000-4000-8000-000000000001",
        canvasId,
        actor: { id: actorId, type: "human" },
        origin: "human",
        issuedAt: new Date().toISOString(),
        type: "object.delete",
        payload: { objectId: result.objectId },
      });
      expect(readCanvasObjectV2(reloaded, result.objectId)).toBeUndefined();
    },
  );
  it.each(["document", "transcript"])(
    "creates undoable %s with server-owned content",
    async (kind) => {
      const document = createProductCanvasDocument(canvasId);
      const result = await buildConversationDocumentUpdate({
        document,
        canvasId,
        actorId,
        runId,
        callKey: kind,
        arguments: {
          kind,
          title: "Requested document",
          text: kind === "transcript" ? "Invented words" : "",
        },
        conversation: JSON.stringify({
          fragments: [{ speaker: "user", text: "We agreed to use green." }],
        }),
      });
      Y.applyUpdate(document, result.update);
      expect(await documentContentHash(document, result.objectId)).toBe(
        result.contentHash,
      );
      const body = JSON.stringify(
        getProductDocumentContentRoot(document, result.objectId).toJSON(),
      );
      if (kind === "transcript") {
        expect(body).toContain("We agreed to use green.");
        expect(body).not.toContain("Invented words");
        expect(body).toContain("not a complete session");
      }
      const undo = buildUndoAiChangeSetUpdate({
        document,
        objectChanges: result.reviewStage.objectChanges.map(
          (change, index) => ({ ...change, id: `change-${index}` }),
        ),
      });
      Y.applyUpdate(document, undo.update);
      expect(readCanvasObjectV2(document, result.objectId)).toBeUndefined();
    },
  );
  it("rejects transcript masquerading as generated content", async () => {
    await expect(
      buildConversationDocumentUpdate({
        document: createProductCanvasDocument(canvasId),
        canvasId,
        actorId,
        runId,
        callKey: "save",
        arguments: {
          kind: "transcript",
          title: "Full transcript",
          text: "Invented words",
        },
      }),
    ).rejects.toThrow();
  });
});
