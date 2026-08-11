import { z } from "zod";

import { canvasObjectSchema, type CanvasObject } from "@/domain/canvas-object";

export const canvasRoleSchema = z.enum([
  "owner",
  "editor",
  "commenter",
  "viewer",
]);

const commandBaseSchema = z.object({
  schemaVersion: z.literal(1),
  commandId: z.uuid(),
  canvasId: z.uuid(),
  actor: z.object({
    id: z.uuid(),
    type: z.enum(["human", "ai"]),
  }),
  origin: z.enum(["human", "ai"]),
  issuedAt: z.iso.datetime(),
});

const createObjectCommandSchema = commandBaseSchema.extend({
  type: z.literal("object.create"),
  payload: z.object({ object: canvasObjectSchema }),
});

const updateObjectCommandSchema = commandBaseSchema.extend({
  type: z.literal("object.update"),
  payload: z.object({ objectId: z.uuid(), object: canvasObjectSchema }),
});

const deleteObjectCommandSchema = commandBaseSchema.extend({
  type: z.literal("object.delete"),
  payload: z.object({ objectId: z.uuid() }),
});

export const canvasCommandSchema = z
  .discriminatedUnion("type", [
    createObjectCommandSchema,
    updateObjectCommandSchema,
    deleteObjectCommandSchema,
  ])
  .superRefine((command, context) => {
    if (command.actor.type !== command.origin) {
      context.addIssue({
        code: "custom",
        message: "Command origin must match the actor type.",
        path: ["origin"],
      });
    }

    if (
      "object" in command.payload &&
      command.payload.object.canvasId !== command.canvasId
    ) {
      context.addIssue({
        code: "custom",
        message: "Command and object must target the same canvas.",
        path: ["payload", "object", "canvasId"],
      });
    }
  });

export type CanvasRole = z.infer<typeof canvasRoleSchema>;
export type CanvasCommand = z.infer<typeof canvasCommandSchema>;

export type UndoOperation =
  | { type: "object.delete"; objectId: string }
  | { type: "object.create"; object: CanvasObject }
  | { type: "object.restore"; object: CanvasObject };

export type CommandAuditRecord = {
  commandId: string;
  canvasId: string;
  actorId: string;
  actorType: "human" | "ai";
  origin: "human" | "ai";
  commandType: CanvasCommand["type"];
  affectedObjectIds: string[];
  occurredAt: string;
};

export type CollaborationUpdate = {
  canvasId: string;
  commandId: string;
  affectedObjectIds: string[];
  object: CanvasObject | null;
};

export interface CommandRepository {
  getRole(canvasId: string, actorId: string): Promise<CanvasRole | null>;
  getObject(canvasId: string, objectId: string): Promise<CanvasObject | null>;
  putObject(object: CanvasObject): Promise<void>;
  deleteObject(canvasId: string, objectId: string): Promise<void>;
  recordAudit(record: CommandAuditRecord): Promise<void>;
  publish(update: CollaborationUpdate): Promise<void>;
}

export type CommandResult = {
  command: CanvasCommand;
  undo: UndoOperation;
  audit: CommandAuditRecord;
  collaboration: CollaborationUpdate;
};

export class CommandPermissionError extends Error {
  constructor() {
    super("The current actor is not permitted to mutate this canvas.");
    this.name = "CommandPermissionError";
  }
}

export class CommandConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommandConflictError";
  }
}

export function canMutateCanvas(role: CanvasRole | null) {
  return role === "owner" || role === "editor";
}

export async function executeCommand(
  input: unknown,
  repository: CommandRepository,
): Promise<CommandResult> {
  const command = canvasCommandSchema.parse(input);
  const role = await repository.getRole(command.canvasId, command.actor.id);

  if (!canMutateCanvas(role)) {
    throw new CommandPermissionError();
  }

  let undo: UndoOperation;
  let collaborationObject: CanvasObject | null;
  let affectedObjectId: string;

  if (command.type === "object.create") {
    const existing = await repository.getObject(
      command.canvasId,
      command.payload.object.id,
    );

    if (existing) {
      throw new CommandConflictError("The object already exists.");
    }

    await repository.putObject(command.payload.object);
    affectedObjectId = command.payload.object.id;
    collaborationObject = command.payload.object;
    undo = { type: "object.delete", objectId: affectedObjectId };
  } else {
    const existing = await repository.getObject(
      command.canvasId,
      command.payload.objectId,
    );

    if (!existing) {
      throw new CommandConflictError("The target object does not exist.");
    }

    affectedObjectId = existing.id;

    if (command.type === "object.update") {
      if (command.payload.object.id !== existing.id) {
        throw new CommandConflictError(
          "An update cannot change object identity.",
        );
      }

      await repository.putObject(command.payload.object);
      collaborationObject = command.payload.object;
      undo = { type: "object.restore", object: existing };
    } else {
      await repository.deleteObject(command.canvasId, existing.id);
      collaborationObject = null;
      undo = { type: "object.create", object: existing };
    }
  }

  const audit: CommandAuditRecord = {
    commandId: command.commandId,
    canvasId: command.canvasId,
    actorId: command.actor.id,
    actorType: command.actor.type,
    origin: command.origin,
    commandType: command.type,
    affectedObjectIds: [affectedObjectId],
    occurredAt: command.issuedAt,
  };
  const collaboration: CollaborationUpdate = {
    canvasId: command.canvasId,
    commandId: command.commandId,
    affectedObjectIds: [affectedObjectId],
    object: collaborationObject,
  };

  await repository.recordAudit(audit);
  await repository.publish(collaboration);

  return { command, undo, audit, collaboration };
}
