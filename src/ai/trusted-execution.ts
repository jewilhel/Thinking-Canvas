import * as Y from "yjs";

import { executeArgumentsSchema } from "@/ai/tool-registry";
import { executeProductCanvasCommand } from "@/domain/canvas-command";

function bytesToUuid(bytes: Uint8Array) {
  const value = Uint8Array.from(bytes.slice(0, 16));
  value[6] = (value[6] & 0x0f) | 0x50;
  value[8] = (value[8] & 0x3f) | 0x80;
  const hex = [...value].map((byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

export async function stableAiToolCommandId(input: {
  runId: string;
  callKey: string;
}) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${input.runId}\0${input.callKey}`),
  );
  return bytesToUuid(new Uint8Array(digest));
}

export async function buildTrustedCanvasUpdate(input: {
  document: Y.Doc;
  canvasId: string;
  actorId: string;
  runId: string;
  callKey: string;
  commands: unknown[];
}) {
  const { commands } = executeArgumentsSchema.parse({
    commands: input.commands,
  });
  const commandId = await stableAiToolCommandId(input);
  const issuedAt = new Date().toISOString();
  const stateVector = Y.encodeStateVector(input.document);
  const nextDocument = new Y.Doc();
  Y.applyUpdate(nextDocument, Y.encodeStateAsUpdate(input.document));
  const affectedObjectIds = new Set<string>();

  for (const command of commands) {
    const result = executeProductCanvasCommand(nextDocument, {
      ...command,
      schemaVersion: 2,
      commandId,
      canvasId: input.canvasId,
      actor: { id: input.actorId, type: "ai" },
      origin: "ai",
      issuedAt,
    });
    for (const objectId of result.affectedObjectIds) {
      affectedObjectIds.add(objectId);
    }
  }

  const update = Y.encodeStateAsUpdate(nextDocument, stateVector);
  if (update.length <= 2) {
    throw new Error("Trusted canvas commands must change canonical state.");
  }

  return {
    commandId,
    update,
    affectedObjectIds: [...affectedObjectIds],
    commandTypes: commands.map((command) => command.type),
    summary: `Applied ${commands.length} canvas command${commands.length === 1 ? "" : "s"}: ${commands.map((command) => command.type).join(", ")}.`,
  };
}
