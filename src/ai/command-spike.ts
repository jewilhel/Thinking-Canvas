import { z } from "zod";

import {
  buildAiCanvasProjection,
  AI_INSTRUCTION_MAX_LENGTH,
  type AiCanvasProjection,
} from "@/ai/projection";
import { type CanvasObject } from "@/domain/canvas-object";
import {
  canMutateCanvas,
  CommandPermissionError,
  executeCommand,
  type CanvasRole,
  type CommandRepository,
  type CommandResult,
} from "@/domain/command";

const requestSchema = z.strictObject({
  canvasId: z.uuid(),
  actorId: z.uuid(),
  role: z.enum(["owner", "editor", "commenter", "viewer"]),
  instruction: z.string().trim().min(1).max(AI_INSTRUCTION_MAX_LENGTH),
  objects: z.array(z.unknown()),
});

export const updateTextToolArgumentsSchema = z.strictObject({
  objectId: z.uuid(),
  text: z.string().max(10_000),
});

export type AiToolCall = {
  name: string;
  arguments: string;
  callId: string;
};

export interface AiResponsesGateway {
  requestCanvasCommand(input: {
    instruction: string;
    projection: AiCanvasProjection;
    safetyIdentifier: string;
  }): Promise<{ requestId: string | null; toolCall: AiToolCall | null }>;
}

export class AiToolValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiToolValidationError";
  }
}

class ScopedCommandRepository implements CommandRepository {
  readonly objects: Map<string, CanvasObject>;
  readonly audits: Parameters<CommandRepository["recordAudit"]>[0][] = [];
  readonly updates: Parameters<CommandRepository["publish"]>[0][] = [];

  constructor(
    objects: CanvasObject[],
    private readonly canvasId: string,
    private readonly actorId: string,
    private readonly role: CanvasRole,
  ) {
    this.objects = new Map(objects.map((object) => [object.id, object]));
  }

  async getRole(canvasId: string, actorId: string) {
    return canvasId === this.canvasId && actorId === this.actorId
      ? this.role
      : null;
  }

  async getObject(canvasId: string, objectId: string) {
    return canvasId === this.canvasId
      ? (this.objects.get(objectId) ?? null)
      : null;
  }

  async putObject(object: CanvasObject) {
    this.objects.set(object.id, object);
  }

  async deleteObject(canvasId: string, objectId: string) {
    if (canvasId === this.canvasId) this.objects.delete(objectId);
  }

  async recordAudit(record: Parameters<CommandRepository["recordAudit"]>[0]) {
    this.audits.push(record);
  }

  async publish(update: Parameters<CommandRepository["publish"]>[0]) {
    this.updates.push(update);
  }
}

export async function runAiCommandSpike(
  input: unknown,
  gateway: AiResponsesGateway,
): Promise<{
  requestId: string | null;
  result: CommandResult;
  before: CanvasObject;
  after: CanvasObject;
  affectedFields: ["text"];
}> {
  const request = requestSchema.parse(input);
  if (!canMutateCanvas(request.role)) throw new CommandPermissionError();
  const projection = buildAiCanvasProjection({
    canvasId: request.canvasId,
    objects: request.objects,
  });
  const objects = request.objects.map((object) => {
    const projected = projection.objects.find(
      (candidate) => candidate.id === (object as { id?: unknown }).id,
    );
    if (!projected) throw new AiToolValidationError("Object is not projected.");
    return object as CanvasObject;
  });

  const response = await gateway.requestCanvasCommand({
    instruction: request.instruction,
    projection,
    safetyIdentifier: request.actorId,
  });

  if (!response.toolCall || response.toolCall.name !== "update_canvas_text") {
    throw new AiToolValidationError(
      "The model did not return the required canvas command.",
    );
  }

  let rawArguments: unknown;
  try {
    rawArguments = JSON.parse(response.toolCall.arguments);
  } catch {
    throw new AiToolValidationError("The model returned malformed tool JSON.");
  }

  const argumentsResult = updateTextToolArgumentsSchema.safeParse(rawArguments);
  if (!argumentsResult.success) {
    throw new AiToolValidationError(
      "The model returned invalid tool arguments.",
    );
  }

  const before = objects.find(
    (object) => object.id === argumentsResult.data.objectId,
  );
  if (!before || (before.type !== "text" && before.type !== "shape")) {
    throw new AiToolValidationError(
      "The model targeted an unavailable or unsupported object.",
    );
  }

  const after: CanvasObject = {
    ...before,
    text: argumentsResult.data.text,
    updatedAt: new Date().toISOString(),
  };
  const repository = new ScopedCommandRepository(
    objects,
    request.canvasId,
    request.actorId,
    request.role,
  );
  const result = await executeCommand(
    {
      schemaVersion: 1,
      commandId: crypto.randomUUID(),
      canvasId: request.canvasId,
      actor: { id: request.actorId, type: "ai" },
      origin: "ai",
      issuedAt: after.updatedAt,
      type: "object.update",
      payload: { objectId: before.id, object: after },
    },
    repository,
  );

  return {
    requestId: response.requestId,
    result,
    before,
    after,
    affectedFields: ["text"],
  };
}
