import { z } from "zod";
import type * as Y from "yjs";

import {
  canvasObjectV2Schema,
  deleteCanvasObjectV2,
  listCanvasObjectsV2,
  putCanvasObjectV2,
  readCanvasDocumentMetadata,
  readCanvasObjectV2,
  readCanvasOrderV2,
  setCanvasObjectField,
  setCanvasOrderV2,
} from "@/canvas/canvas-document";
import { resolveConnectorEndpointV2 } from "@/canvas/geometry";

const uuid = z.uuid();
const finiteNumber = z.number().finite();
const endpointSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("free"), x: finiteNumber, y: finiteNumber }),
  z.strictObject({
    kind: z.literal("attached"),
    objectId: uuid,
    anchor: z.enum(["top", "right", "bottom", "left", "center"]),
  }),
]);

const commandBase = z.strictObject({
  schemaVersion: z.literal(2),
  commandId: uuid,
  canvasId: uuid,
  actor: z.strictObject({ id: uuid, type: z.enum(["human", "ai"]) }),
  origin: z.enum(["human", "ai"]),
  issuedAt: z.iso.datetime(),
});

const createCommand = commandBase.extend({
  type: z.literal("object.create"),
  payload: z.strictObject({ object: canvasObjectV2Schema }),
});
const patchCommand = commandBase.extend({
  type: z.literal("object.patch"),
  payload: z.discriminatedUnion("objectType", [
    z.strictObject({
      objectId: uuid,
      objectType: z.literal("shape"),
      text: z.string().max(10_000),
    }),
    z.strictObject({
      objectId: uuid,
      objectType: z.literal("text"),
      text: z.string().max(100_000),
    }),
    z.strictObject({
      objectId: uuid,
      objectType: z.literal("table"),
      cells: z
        .array(z.array(z.string().max(10_000)))
        .min(1)
        .max(100),
    }),
  ]),
});
const moveCommand = commandBase.extend({
  type: z.literal("object.move"),
  payload: z.strictObject({ objectId: uuid, x: finiteNumber, y: finiteNumber }),
});
const resizeCommand = commandBase.extend({
  type: z.literal("object.resize"),
  payload: z.strictObject({
    objectId: uuid,
    width: finiteNumber.min(24),
    height: finiteNumber.min(24),
  }),
});
const deleteCommand = commandBase.extend({
  type: z.literal("object.delete"),
  payload: z.strictObject({ objectId: uuid }),
});
const styleCommand = commandBase.extend({
  type: z.literal("object.style"),
  payload: z.strictObject({
    objectId: uuid,
    style: z
      .strictObject({
        fill: z.string().min(1).max(100).nullable().optional(),
        outline: z.string().min(1).max(100).optional(),
        outlineWidth: finiteNumber.min(0).max(20).optional(),
        fontFamily: z.string().min(1).max(200).optional(),
        fontSize: finiteNumber.min(8).max(400).optional(),
      })
      .refine(
        (style) => Object.keys(style).length > 0,
        "A style field is required.",
      ),
  }),
});
const endpointCommand = commandBase.extend({
  type: z.literal("connector.endpoint"),
  payload: z.strictObject({
    objectId: uuid,
    endpoint: z.enum(["start", "end"]),
    value: endpointSchema,
  }),
});
const reorderCommand = commandBase.extend({
  type: z.literal("object.reorder"),
  payload: z.strictObject({
    objectId: uuid,
    direction: z.enum(["front", "forward", "backward", "back"]),
  }),
});
const groupCommand = commandBase.extend({
  type: z.literal("selection.group"),
  payload: z.strictObject({
    objectIds: z.array(uuid).min(2).max(1_000),
    groupId: uuid,
  }),
});
const ungroupCommand = commandBase.extend({
  type: z.literal("selection.ungroup"),
  payload: z.strictObject({ groupId: uuid }),
});
const duplicateCommand = commandBase.extend({
  type: z.literal("selection.duplicate"),
  payload: z.strictObject({
    objects: z.array(canvasObjectV2Schema).min(1).max(1_000),
  }),
});

export const productCanvasCommandSchema = z
  .discriminatedUnion("type", [
    createCommand,
    patchCommand,
    moveCommand,
    resizeCommand,
    deleteCommand,
    styleCommand,
    endpointCommand,
    reorderCommand,
    groupCommand,
    ungroupCommand,
    duplicateCommand,
  ])
  .superRefine((command, context) => {
    if (command.actor.type !== command.origin) {
      context.addIssue({
        code: "custom",
        path: ["origin"],
        message: "Command origin must match the actor type.",
      });
    }
    if (
      (command.type === "object.create" &&
        command.payload.object.canvasId !== command.canvasId) ||
      (command.type === "selection.duplicate" &&
        command.payload.objects.some(
          (object) => object.canvasId !== command.canvasId,
        ))
    ) {
      context.addIssue({
        code: "custom",
        path: ["payload", "canvasId"],
        message: "Command and object must target the same canvas.",
      });
    }
  });

export type ProductCanvasCommand = z.infer<typeof productCanvasCommandSchema>;

export class ProductCanvasCommandConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductCanvasCommandConflictError";
  }
}

function requireObject(document: Y.Doc, objectId: string) {
  const object = readCanvasObjectV2(document, objectId);
  if (!object) {
    throw new ProductCanvasCommandConflictError(
      "The target object does not exist.",
    );
  }
  return object;
}

function touch(document: Y.Doc, objectId: string, issuedAt: string) {
  setCanvasObjectField(document, objectId, ["updatedAt"], issuedAt);
}

function assertEligibleEndpoint(
  document: Y.Doc,
  connectorId: string,
  endpoint: z.infer<typeof endpointSchema>,
  pendingObjects: ReadonlyMap<
    string,
    z.infer<typeof canvasObjectV2Schema>
  > = new Map(),
) {
  if (endpoint.kind === "free") return;
  const target =
    pendingObjects.get(endpoint.objectId) ??
    readCanvasObjectV2(document, endpoint.objectId);
  if (!target || target.type !== "shape" || target.id === connectorId) {
    throw new ProductCanvasCommandConflictError(
      "Attached connector endpoints require an existing eligible shape.",
    );
  }
}

export function executeProductCanvasCommand(document: Y.Doc, input: unknown) {
  const command = productCanvasCommandSchema.parse(input);
  if (readCanvasDocumentMetadata(document).canvasId !== command.canvasId) {
    throw new ProductCanvasCommandConflictError(
      "Command and document must target the same canvas.",
    );
  }

  const affectedObjectIds = new Set<string>();
  document.transact(() => {
    if (command.type === "object.create") {
      if (readCanvasObjectV2(document, command.payload.object.id)) {
        throw new ProductCanvasCommandConflictError(
          "The object already exists.",
        );
      }
      if (command.payload.object.type === "connector") {
        assertEligibleEndpoint(
          document,
          command.payload.object.id,
          command.payload.object.start,
        );
        assertEligibleEndpoint(
          document,
          command.payload.object.id,
          command.payload.object.end,
        );
      }
      putCanvasObjectV2(document, command.payload.object);
      affectedObjectIds.add(command.payload.object.id);
      return;
    }

    if (command.type === "selection.duplicate") {
      const ids = command.payload.objects.map((object) => object.id);
      const pendingObjects = new Map(
        command.payload.objects.map((object) => [object.id, object]),
      );
      if (new Set(ids).size !== ids.length) {
        throw new ProductCanvasCommandConflictError(
          "Duplicated objects must have unique identities.",
        );
      }
      for (const object of command.payload.objects) {
        if (readCanvasObjectV2(document, object.id)) {
          throw new ProductCanvasCommandConflictError(
            "A duplicated object identity already exists.",
          );
        }
        if (object.type === "connector") {
          assertEligibleEndpoint(
            document,
            object.id,
            object.start,
            pendingObjects,
          );
          assertEligibleEndpoint(
            document,
            object.id,
            object.end,
            pendingObjects,
          );
        }
      }
      for (const object of command.payload.objects) {
        putCanvasObjectV2(document, object);
        affectedObjectIds.add(object.id);
      }
      return;
    }

    if (command.type === "selection.group") {
      if (
        new Set(command.payload.objectIds).size !==
        command.payload.objectIds.length
      ) {
        throw new ProductCanvasCommandConflictError(
          "A group cannot contain duplicate object identities.",
        );
      }
      const selected = command.payload.objectIds.map((id) =>
        requireObject(document, id),
      );
      if (selected.some((object) => object.groupId != null)) {
        throw new ProductCanvasCommandConflictError(
          "Nested groups are not supported.",
        );
      }
      for (const object of selected) {
        setCanvasObjectField(
          document,
          object.id,
          ["groupId"],
          command.payload.groupId,
        );
        touch(document, object.id, command.issuedAt);
        affectedObjectIds.add(object.id);
      }
      return;
    }

    if (command.type === "selection.ungroup") {
      const grouped = listCanvasObjectsV2(document).filter(
        (object) => object.groupId === command.payload.groupId,
      );
      if (!grouped.length) {
        throw new ProductCanvasCommandConflictError(
          "The group does not exist.",
        );
      }
      for (const object of grouped) {
        setCanvasObjectField(document, object.id, ["groupId"], null);
        touch(document, object.id, command.issuedAt);
        affectedObjectIds.add(object.id);
      }
      return;
    }

    if (command.type === "object.reorder") {
      requireObject(document, command.payload.objectId);
      const currentOrder = readCanvasOrderV2(document);
      const currentIndex = currentOrder.indexOf(command.payload.objectId);
      const targetIndex =
        command.payload.direction === "front"
          ? currentOrder.length - 1
          : command.payload.direction === "back"
            ? 0
            : command.payload.direction === "forward"
              ? Math.min(currentOrder.length - 1, currentIndex + 1)
              : Math.max(0, currentIndex - 1);
      currentOrder.splice(currentIndex, 1);
      currentOrder.splice(targetIndex, 0, command.payload.objectId);
      setCanvasOrderV2(document, currentOrder);
      touch(document, command.payload.objectId, command.issuedAt);
      affectedObjectIds.add(command.payload.objectId);
      return;
    }

    const object = requireObject(document, command.payload.objectId);
    affectedObjectIds.add(object.id);

    if (command.type === "object.move") {
      setCanvasObjectField(
        document,
        object.id,
        ["geometry", "x"],
        command.payload.x,
      );
      setCanvasObjectField(
        document,
        object.id,
        ["geometry", "y"],
        command.payload.y,
      );
    } else if (command.type === "object.resize") {
      setCanvasObjectField(
        document,
        object.id,
        ["geometry", "width"],
        command.payload.width,
      );
      setCanvasObjectField(
        document,
        object.id,
        ["geometry", "height"],
        command.payload.height,
      );
    } else if (command.type === "object.patch") {
      if (object.type !== command.payload.objectType) {
        throw new ProductCanvasCommandConflictError(
          "The patch does not match the target object type.",
        );
      }
      if (command.payload.objectType === "table") {
        setCanvasObjectField(
          document,
          object.id,
          ["cells"],
          command.payload.cells,
        );
      } else {
        setCanvasObjectField(
          document,
          object.id,
          ["text"],
          command.payload.text,
        );
      }
    } else if (command.type === "object.style") {
      for (const [field, value] of Object.entries(command.payload.style)) {
        setCanvasObjectField(document, object.id, ["style", field], value);
      }
    } else if (command.type === "connector.endpoint") {
      if (object.type !== "connector") {
        throw new ProductCanvasCommandConflictError(
          "Connector endpoints can only be changed on connectors.",
        );
      }
      assertEligibleEndpoint(document, object.id, command.payload.value);
      setCanvasObjectField(
        document,
        object.id,
        [command.payload.endpoint],
        command.payload.value,
      );
    } else {
      const objectsById = new Map(
        listCanvasObjectsV2(document).map((candidate) => [
          candidate.id,
          candidate,
        ]),
      );
      for (const candidate of objectsById.values()) {
        if (candidate.type !== "connector") continue;
        for (const endpoint of ["start", "end"] as const) {
          const value = candidate[endpoint];
          if (value.kind !== "attached" || value.objectId !== object.id)
            continue;
          const point = resolveConnectorEndpointV2(value, objectsById);
          setCanvasObjectField(document, candidate.id, [endpoint], {
            kind: "free",
            ...point,
          });
          touch(document, candidate.id, command.issuedAt);
          affectedObjectIds.add(candidate.id);
        }
      }
      deleteCanvasObjectV2(document, object.id);
      return;
    }

    touch(document, object.id, command.issuedAt);
  }, command.commandId);

  return { command, affectedObjectIds: [...affectedObjectIds] };
}
