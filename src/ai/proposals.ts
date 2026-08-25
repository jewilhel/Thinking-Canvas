import * as Y from "yjs";

import {
  executeProductCanvasCommand,
  productCanvasMutationSchema,
  type ProductCanvasMutation,
} from "@/domain/canvas-command";

export type ValidatedCanvasProposal = {
  commands: ProductCanvasMutation[];
  affectedObjectIds: string[];
  commandTypes: ProductCanvasMutation["type"][];
  summary: string;
};

export function validateCanvasProposal(input: {
  document: Y.Doc;
  canvasId: string;
  actorId: string;
  commands: unknown[];
}): ValidatedCanvasProposal {
  const proposalDocument = new Y.Doc();
  Y.applyUpdate(proposalDocument, Y.encodeStateAsUpdate(input.document));
  const commands = input.commands.map((command) =>
    productCanvasMutationSchema.parse(command),
  );
  const affectedObjectIds = new Set<string>();
  const lines = commands.map((command, index) => {
    const result = executeProductCanvasCommand(proposalDocument, {
      ...command,
      schemaVersion: 2,
      commandId: crypto.randomUUID(),
      canvasId: input.canvasId,
      actor: { id: input.actorId, type: "ai" },
      origin: "ai",
      issuedAt: new Date(index).toISOString(),
    });
    for (const objectId of result.affectedObjectIds) {
      affectedObjectIds.add(objectId);
    }
    return `${index + 1}. ${command.type} — affected ${result.affectedObjectIds.join(", ")}`;
  });

  return {
    commands,
    affectedObjectIds: [...affectedObjectIds],
    commandTypes: commands.map((command) => command.type),
    summary: `Proposed changes (not applied):\n${lines.join("\n")}`,
  };
}
