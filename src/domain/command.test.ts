import { describe, expect, it } from "vitest";

import type { CanvasObject } from "@/domain/canvas-object";
import {
  CommandConflictError,
  CommandPermissionError,
  executeCommand,
  type CanvasRole,
  type CollaborationUpdate,
  type CommandAuditRecord,
  type CommandRepository,
} from "@/domain/command";

const canvasId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const objectId = "33333333-3333-4333-8333-333333333333";
const now = "2026-08-10T20:00:00.000Z";

function makeObject(text = "First idea"): CanvasObject {
  return {
    schemaVersion: 1,
    id: objectId,
    canvasId,
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
    type: "text",
    text,
    geometry: { x: 10, y: 20, width: 240, height: 80, rotation: 0 },
  };
}

class MemoryRepository implements CommandRepository {
  objects = new Map<string, CanvasObject>();
  audits: CommandAuditRecord[] = [];
  updates: CollaborationUpdate[] = [];

  constructor(private readonly role: CanvasRole | null) {}

  async getRole() {
    return this.role;
  }

  async getObject(_canvasId: string, id: string) {
    return this.objects.get(id) ?? null;
  }

  async putObject(object: CanvasObject) {
    this.objects.set(object.id, object);
  }

  async deleteObject(_canvasId: string, id: string) {
    this.objects.delete(id);
  }

  async recordAudit(record: CommandAuditRecord) {
    this.audits.push(record);
  }

  async publish(update: CollaborationUpdate) {
    this.updates.push(update);
  }
}

function createCommand(object = makeObject()) {
  return {
    schemaVersion: 1,
    commandId: "44444444-4444-4444-8444-444444444444",
    canvasId,
    actor: { id: actorId, type: "human" },
    origin: "human",
    issuedAt: now,
    type: "object.create",
    payload: { object },
  };
}

describe("executeCommand", () => {
  it("applies an authorized command and emits undo, audit, and collaboration metadata", async () => {
    const repository = new MemoryRepository("editor");
    const result = await executeCommand(createCommand(), repository);

    expect(repository.objects.get(objectId)).toEqual(makeObject());
    expect(result.undo).toEqual({ type: "object.delete", objectId });
    expect(result.audit).toMatchObject({
      actorId,
      actorType: "human",
      origin: "human",
      commandType: "object.create",
      affectedObjectIds: [objectId],
    });
    expect(result.collaboration.object).toEqual(makeObject());
    expect(repository.audits).toHaveLength(1);
    expect(repository.updates).toHaveLength(1);
  });

  it.each(["commenter", "viewer", null] as const)(
    "denies object mutation to role %s before persistence",
    async (role) => {
      const repository = new MemoryRepository(role);

      await expect(
        executeCommand(createCommand(), repository),
      ).rejects.toBeInstanceOf(CommandPermissionError);
      expect(repository.objects.size).toBe(0);
      expect(repository.audits).toHaveLength(0);
      expect(repository.updates).toHaveLength(0);
    },
  );

  it("rejects duplicate object identity without emitting side effects", async () => {
    const repository = new MemoryRepository("owner");
    repository.objects.set(objectId, makeObject());

    await expect(
      executeCommand(createCommand(), repository),
    ).rejects.toBeInstanceOf(CommandConflictError);
    expect(repository.audits).toHaveLength(0);
    expect(repository.updates).toHaveLength(0);
  });

  it("records a complete before image for update undo", async () => {
    const repository = new MemoryRepository("owner");
    repository.objects.set(objectId, makeObject());
    const updated = {
      ...makeObject("Revised idea"),
      updatedAt: "2026-08-10T20:01:00.000Z",
    };

    const result = await executeCommand(
      {
        ...createCommand(),
        type: "object.update",
        payload: { objectId, object: updated },
      },
      repository,
    );

    expect(repository.objects.get(objectId)).toEqual(updated);
    expect(result.undo).toEqual({
      type: "object.restore",
      object: makeObject(),
    });
  });

  it("records the deleted object for create-based undo", async () => {
    const repository = new MemoryRepository("editor");
    repository.objects.set(objectId, makeObject());

    const result = await executeCommand(
      {
        ...createCommand(),
        type: "object.delete",
        payload: { objectId },
      },
      repository,
    );

    expect(repository.objects.has(objectId)).toBe(false);
    expect(result.undo).toEqual({
      type: "object.create",
      object: makeObject(),
    });
    expect(result.collaboration.object).toBeNull();
  });

  it("validates that AI commands identify an AI actor", async () => {
    const repository = new MemoryRepository("editor");
    const command = { ...createCommand(), origin: "ai" };

    await expect(executeCommand(command, repository)).rejects.toThrow(
      "Command origin must match the actor type.",
    );
  });
});
