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
  type CanvasObjectV2,
} from "@/canvas/canvas-document";
import { resolveConnectorEndpointV2 } from "@/canvas/geometry";
import {
  boundParentGeometryToChildren,
  childRelativeAfterParentResize,
  childWorldGeometry,
  clampObjectGeometryToParent,
  defaultChildLayout,
  fullyContains,
  flipGeometryWithinParent,
  isContainableObject,
  isObjectParent,
  parentRelativeGeometry,
  rotateGeometryAroundCenter,
  type ContainableObject,
  type ObjectParent,
} from "@/canvas/icon-containment";
import { isEligibleAnnotationTarget } from "@/canvas/annotation-attachment";

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
    width: finiteNumber.min(8),
    height: finiteNumber.min(8),
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
        outlinePattern: z.enum(["solid", "dashed", "dotted"]).optional(),
        fontFamily: z.string().min(1).max(200).optional(),
        fontSize: finiteNumber.min(8).max(400).optional(),
        fontWeight: z.enum(["normal", "bold"]).optional(),
        textAlign: z.enum(["left", "center", "right"]).optional(),
        listStyle: z.enum(["none", "bullet", "numbered"]).optional(),
        linkUrl: z
          .url()
          .max(2_048)
          .refine(
            (value) =>
              value.startsWith("https://") || value.startsWith("http://"),
            "Canvas text links must use HTTP or HTTPS.",
          )
          .nullable()
          .optional(),
        textColor: z.string().min(1).max(100).optional(),
        opacity: finiteNumber.min(0).max(1).optional(),
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
const promoteAnnotationCommand = commandBase.extend({
  type: z.literal("annotation.promote"),
  payload: z.strictObject({ objectId: uuid }),
});
const attachAnnotationCommand = commandBase.extend({
  type: z.literal("annotation.attach"),
  payload: z.strictObject({ objectId: uuid, targetObjectId: uuid }),
});
const disconnectAnnotationCommand = commandBase.extend({
  type: z.literal("annotation.disconnect"),
  payload: z.strictObject({ objectId: uuid }),
});
const nestIconCommand = commandBase.extend({
  type: z.literal("icon.nest"),
  payload: z.strictObject({ objectId: uuid, parentId: uuid }),
});
const detachIconCommand = commandBase.extend({
  type: z.literal("icon.detach"),
  payload: z.strictObject({ objectId: uuid }),
});
const nestObjectCommand = commandBase.extend({
  type: z.literal("object.nest"),
  payload: z.strictObject({ objectId: uuid, parentId: uuid }),
});
const detachObjectCommand = commandBase.extend({
  type: z.literal("object.detach"),
  payload: z.strictObject({ objectId: uuid }),
});
const layoutObjectCommand = commandBase.extend({
  type: z.literal("object.layout"),
  payload: z.strictObject({
    objectId: uuid,
    pinPosition: z.boolean(),
    scaleWidth: z.boolean(),
    scaleHeight: z.boolean(),
  }),
});
const rotateObjectCommand = commandBase.extend({
  type: z.literal("object.rotate"),
  payload: z.strictObject({ objectId: uuid, rotation: finiteNumber }),
});
const flipObjectCommand = commandBase.extend({
  type: z.literal("object.flip"),
  payload: z.strictObject({
    objectId: uuid,
    axis: z.enum(["horizontal", "vertical"]),
  }),
});
const transformObjectCommand = commandBase.extend({
  type: z.literal("object.transform"),
  payload: z.strictObject({
    objectId: uuid,
    x: finiteNumber,
    y: finiteNumber,
    width: finiteNumber.min(8),
    height: finiteNumber.min(8),
    rotation: finiteNumber,
    preserveChildren: z.boolean().optional(),
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

const trustedCommandFields = {
  schemaVersion: true,
  commandId: true,
  canvasId: true,
  actor: true,
  origin: true,
  issuedAt: true,
} as const;

export const productCanvasMutationSchema = z.discriminatedUnion("type", [
  createCommand.omit(trustedCommandFields),
  patchCommand.omit(trustedCommandFields),
  moveCommand.omit(trustedCommandFields),
  resizeCommand.omit(trustedCommandFields),
  deleteCommand.omit(trustedCommandFields),
  styleCommand.omit(trustedCommandFields),
  endpointCommand.omit(trustedCommandFields),
  promoteAnnotationCommand.omit(trustedCommandFields),
  attachAnnotationCommand.omit(trustedCommandFields),
  disconnectAnnotationCommand.omit(trustedCommandFields),
  nestIconCommand.omit(trustedCommandFields),
  detachIconCommand.omit(trustedCommandFields),
  nestObjectCommand.omit(trustedCommandFields),
  detachObjectCommand.omit(trustedCommandFields),
  layoutObjectCommand.omit(trustedCommandFields),
  rotateObjectCommand.omit(trustedCommandFields),
  flipObjectCommand.omit(trustedCommandFields),
  transformObjectCommand.omit(trustedCommandFields),
  reorderCommand.omit(trustedCommandFields),
  groupCommand.omit(trustedCommandFields),
  ungroupCommand.omit(trustedCommandFields),
  duplicateCommand.omit(trustedCommandFields),
]);

export type ProductCanvasMutation = z.infer<typeof productCanvasMutationSchema>;

export const productCanvasCommandSchema = z
  .discriminatedUnion("type", [
    createCommand,
    patchCommand,
    moveCommand,
    resizeCommand,
    deleteCommand,
    styleCommand,
    endpointCommand,
    promoteAnnotationCommand,
    attachAnnotationCommand,
    disconnectAnnotationCommand,
    nestIconCommand,
    detachIconCommand,
    nestObjectCommand,
    detachObjectCommand,
    layoutObjectCommand,
    rotateObjectCommand,
    flipObjectCommand,
    transformObjectCommand,
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
    if (
      command.type === "object.create" &&
      command.payload.object.type === "annotation" &&
      (command.payload.object.strokeVersion !== 1 ||
        !command.payload.object.pressures ||
        !command.payload.object.pointerType ||
        (command.payload.object.attachedObjectId !== null &&
          !command.payload.object.attachmentOffset))
    ) {
      context.addIssue({
        code: "custom",
        path: ["payload", "object"],
        message:
          "New annotations require canonical pressure samples and pointer metadata.",
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
  if (
    !target ||
    (target.type !== "shape" &&
      target.type !== "icon" &&
      target.type !== "text") ||
    target.id === connectorId
  ) {
    throw new ProductCanvasCommandConflictError(
      "Attached connector endpoints require an existing eligible shape, icon, or text object.",
    );
  }
}

function requireEligibleAnnotationTarget(
  document: Y.Doc,
  annotationId: string,
  targetObjectId: string,
) {
  const target = requireObject(document, targetObjectId);
  if (target.id === annotationId || !isEligibleAnnotationTarget(target)) {
    throw new ProductCanvasCommandConflictError(
      "Annotations can attach only to an existing shape, icon, text, or table.",
    );
  }
  return target;
}

function requireObjectParent(
  document: Y.Doc,
  parentId: string,
  pendingObjects: ReadonlyMap<
    string,
    z.infer<typeof canvasObjectV2Schema>
  > = new Map(),
) {
  const parent =
    pendingObjects.get(parentId) ?? readCanvasObjectV2(document, parentId);
  if (!parent || !isObjectParent(parent)) {
    throw new ProductCanvasCommandConflictError(
      "Objects can be placed only inside an existing top-level basic shape or sticky note.",
    );
  }
  return parent;
}

function writeGeometry(
  document: Y.Doc,
  objectId: string,
  geometry: CanvasObjectV2["geometry"],
) {
  for (const field of [
    "x",
    "y",
    "width",
    "height",
    "rotation",
    "flipX",
    "flipY",
  ] as const) {
    if (field === "flipX" || field === "flipY") {
      const value = geometry[field];
      if (value === undefined) continue;
      setCanvasObjectField(document, objectId, ["geometry", field], value);
      continue;
    }
    setCanvasObjectField(
      document,
      objectId,
      ["geometry", field],
      geometry[field],
    );
  }
}

function updateAttachedAnnotationPosition(
  document: Y.Doc,
  targetId: string,
  dx: number,
  dy: number,
  issuedAt: string,
  affectedObjectIds: Set<string>,
  candidates = listCanvasObjectsV2(document),
) {
  if (dx === 0 && dy === 0) return;
  for (const annotation of candidates) {
    if (
      annotation.type !== "annotation" ||
      annotation.attachedObjectId !== targetId
    ) {
      continue;
    }
    setCanvasObjectField(
      document,
      annotation.id,
      ["geometry", "x"],
      annotation.geometry.x + dx,
    );
    setCanvasObjectField(
      document,
      annotation.id,
      ["geometry", "y"],
      annotation.geometry.y + dy,
    );
    touch(document, annotation.id, issuedAt);
    affectedObjectIds.add(annotation.id);
  }
}

function updateChildrenForParentGeometry(
  document: Y.Doc,
  parent: ObjectParent,
  nextGeometry: CanvasObjectV2["geometry"],
  preserveChildren: boolean,
  issuedAt: string,
  affectedObjectIds: Set<string>,
) {
  const allObjects = listCanvasObjectsV2(document);
  const children = allObjects.filter(
    (candidate): candidate is ContainableObject =>
      isContainableObject(candidate) && candidate.parentId === parent.id,
  );
  const boundedGeometry = preserveChildren
    ? boundParentGeometryToChildren(parent, nextGeometry, children)
    : nextGeometry;
  const nextParent = { ...parent, geometry: boundedGeometry };
  for (const child of children) {
    const relative = preserveChildren
      ? parentRelativeGeometry(child.geometry, nextParent)
      : childRelativeAfterParentResize(child, parent, nextParent);
    const nextChild = childWorldGeometry(
      { ...child, parentRelative: relative },
      nextParent,
    );
    setCanvasObjectField(document, child.id, ["parentRelative"], relative);
    writeGeometry(document, child.id, nextChild);
    touch(document, child.id, issuedAt);
    affectedObjectIds.add(child.id);
    updateAttachedAnnotationPosition(
      document,
      child.id,
      nextChild.x - child.geometry.x,
      nextChild.y - child.geometry.y,
      issuedAt,
      affectedObjectIds,
      allObjects,
    );
  }
  return boundedGeometry;
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
      if (
        command.payload.object.type === "annotation" &&
        command.payload.object.attachedObjectId
      ) {
        requireEligibleAnnotationTarget(
          document,
          command.payload.object.id,
          command.payload.object.attachedObjectId,
        );
      }
      if (
        isContainableObject(command.payload.object) &&
        command.payload.object.parentId
      ) {
        const parent = requireObjectParent(
          document,
          command.payload.object.parentId,
        );
        if (!fullyContains(parent, command.payload.object.geometry)) {
          throw new ProductCanvasCommandConflictError(
            "A nested object must be fully contained by its parent.",
          );
        }
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
        if (object.type === "annotation" && object.attachedObjectId) {
          const target =
            pendingObjects.get(object.attachedObjectId) ??
            readCanvasObjectV2(document, object.attachedObjectId);
          if (!target || !isEligibleAnnotationTarget(target)) {
            throw new ProductCanvasCommandConflictError(
              "Duplicated annotation attachments require an eligible target.",
            );
          }
        }
        if (isContainableObject(object) && object.parentId) {
          requireObjectParent(document, object.parentId, pendingObjects);
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
      const object = requireObject(document, command.payload.objectId);
      const currentOrder = readCanvasOrderV2(document);
      if (isObjectParent(object)) {
        const childIds = currentOrder.filter((id) => {
          const candidate = readCanvasObjectV2(document, id);
          return (
            candidate != null &&
            isContainableObject(candidate) &&
            candidate.parentId === object.id
          );
        });
        if (childIds.length) {
          const familyIds = [object.id, ...childIds];
          const familySet = new Set(familyIds);
          const remaining = currentOrder.filter((id) => !familySet.has(id));
          const currentIndex = currentOrder.indexOf(object.id);
          const targetIndex =
            command.payload.direction === "front"
              ? remaining.length
              : command.payload.direction === "back"
                ? 0
                : command.payload.direction === "forward"
                  ? Math.min(remaining.length, currentIndex + 1)
                  : Math.max(0, currentIndex - 1);
          remaining.splice(targetIndex, 0, ...familyIds);
          setCanvasOrderV2(document, remaining);
          for (const id of familyIds) {
            touch(document, id, command.issuedAt);
            affectedObjectIds.add(id);
          }
          return;
        }
      }
      const currentIndex = currentOrder.indexOf(command.payload.objectId);
      let targetIndex =
        command.payload.direction === "front"
          ? currentOrder.length - 1
          : command.payload.direction === "back"
            ? 0
            : command.payload.direction === "forward"
              ? Math.min(currentOrder.length - 1, currentIndex + 1)
              : Math.max(0, currentIndex - 1);
      if (isContainableObject(object) && object.parentId) {
        targetIndex = Math.max(
          currentOrder.indexOf(object.parentId) + 1,
          targetIndex,
        );
      }
      currentOrder.splice(currentIndex, 1);
      currentOrder.splice(targetIndex, 0, command.payload.objectId);
      setCanvasOrderV2(document, currentOrder);
      touch(document, command.payload.objectId, command.issuedAt);
      affectedObjectIds.add(command.payload.objectId);
      return;
    }

    if (command.type === "icon.nest" || command.type === "object.nest") {
      const child = requireObject(document, command.payload.objectId);
      if (command.type === "icon.nest" && child.type !== "icon") {
        throw new ProductCanvasCommandConflictError(
          "Only icon objects can be placed inside a container.",
        );
      }
      if (!isContainableObject(child)) {
        throw new ProductCanvasCommandConflictError(
          "Only shapes, icons, and text can be placed inside a container.",
        );
      }
      if (child.id === command.payload.parentId) {
        throw new ProductCanvasCommandConflictError(
          "An object cannot contain itself.",
        );
      }
      const parent = requireObjectParent(document, command.payload.parentId);
      if (!fullyContains(parent, child.geometry)) {
        throw new ProductCanvasCommandConflictError(
          "Move the object fully inside the container before placing it inside.",
        );
      }
      putCanvasObjectV2(document, {
        ...child,
        parentId: parent.id,
        parentRelative: parentRelativeGeometry(child.geometry, parent),
        childLayout: child.childLayout ?? defaultChildLayout,
        updatedAt: command.issuedAt,
      });
      const order = readCanvasOrderV2(document).filter((id) => id !== child.id);
      const siblingEnd = order.reduce((lastIndex, id, index) => {
        const sibling = readCanvasObjectV2(document, id);
        return sibling &&
          isContainableObject(sibling) &&
          sibling.parentId === parent.id
          ? index
          : lastIndex;
      }, order.indexOf(parent.id));
      order.splice(siblingEnd + 1, 0, child.id);
      setCanvasOrderV2(document, order);
      affectedObjectIds.add(child.id);
      return;
    }

    if (command.type === "icon.detach" || command.type === "object.detach") {
      const child = requireObject(document, command.payload.objectId);
      if (command.type === "icon.detach" && child.type !== "icon") {
        throw new ProductCanvasCommandConflictError(
          "Only icon objects can be removed from a container.",
        );
      }
      if (!isContainableObject(child)) {
        throw new ProductCanvasCommandConflictError(
          "Only shapes, icons, and text can be removed from a container.",
        );
      }
      if (!child.parentId) return;
      putCanvasObjectV2(document, {
        ...child,
        parentId: null,
        parentRelative: null,
        childLayout: null,
        updatedAt: command.issuedAt,
      });
      affectedObjectIds.add(child.id);
      return;
    }

    if (command.type === "object.layout") {
      const child = requireObject(document, command.payload.objectId);
      if (!isContainableObject(child) || !child.parentId) {
        throw new ProductCanvasCommandConflictError(
          "Layout properties require a nested shape, icon, or text object.",
        );
      }
      setCanvasObjectField(document, child.id, ["childLayout"], {
        pinPosition: command.payload.pinPosition,
        scaleWidth: command.payload.scaleWidth,
        scaleHeight: command.payload.scaleHeight,
      });
      touch(document, child.id, command.issuedAt);
      affectedObjectIds.add(child.id);
      return;
    }

    if (command.type === "object.transform") {
      const object = requireObject(document, command.payload.objectId);
      if (!isContainableObject(object)) {
        throw new ProductCanvasCommandConflictError(
          "Only shapes, icons, and text can use direct transforms.",
        );
      }
      const minimumSize = object.type === "icon" ? 8 : 24;
      if (
        command.payload.width < minimumSize ||
        command.payload.height < minimumSize
      ) {
        throw new ProductCanvasCommandConflictError(
          `This object must remain at least ${minimumSize}px wide and high.`,
        );
      }
      let geometry = {
        ...object.geometry,
        x: command.payload.x,
        y: command.payload.y,
        width: command.payload.width,
        height: command.payload.height,
        rotation: command.payload.rotation,
      };
      if (object.parentId) {
        geometry = clampObjectGeometryToParent(
          geometry,
          requireObjectParent(document, object.parentId),
        );
      } else if (isObjectParent(object)) {
        geometry = updateChildrenForParentGeometry(
          document,
          object,
          geometry,
          command.payload.preserveChildren === true,
          command.issuedAt,
          affectedObjectIds,
        );
      }
      writeGeometry(document, object.id, geometry);
      if (object.parentId) {
        const parent = requireObjectParent(document, object.parentId);
        setCanvasObjectField(
          document,
          object.id,
          ["parentRelative"],
          parentRelativeGeometry(geometry, parent),
        );
      }
      updateAttachedAnnotationPosition(
        document,
        object.id,
        geometry.x - object.geometry.x,
        geometry.y - object.geometry.y,
        command.issuedAt,
        affectedObjectIds,
      );
      touch(document, object.id, command.issuedAt);
      affectedObjectIds.add(object.id);
      return;
    }

    const object = requireObject(document, command.payload.objectId);
    affectedObjectIds.add(object.id);

    if (command.type === "object.flip") {
      if (!isContainableObject(object)) {
        throw new ProductCanvasCommandConflictError(
          "Only shapes, icons, and text can be flipped.",
        );
      }
      const axisField =
        command.payload.axis === "horizontal" ? "flipX" : "flipY";
      const nextGeometry = {
        ...object.geometry,
        [axisField]: !object.geometry[axisField],
      };
      if (isObjectParent(object)) {
        const allObjects = listCanvasObjectsV2(document);
        for (const child of allObjects) {
          if (!isContainableObject(child) || child.parentId !== object.id)
            continue;
          const nextChild = flipGeometryWithinParent(
            child.geometry,
            object,
            command.payload.axis,
          );
          writeGeometry(document, child.id, nextChild);
          setCanvasObjectField(
            document,
            child.id,
            ["parentRelative"],
            parentRelativeGeometry(nextChild, object),
          );
          touch(document, child.id, command.issuedAt);
          affectedObjectIds.add(child.id);
          updateAttachedAnnotationPosition(
            document,
            child.id,
            nextChild.x - child.geometry.x,
            nextChild.y - child.geometry.y,
            command.issuedAt,
            affectedObjectIds,
            allObjects,
          );
        }
      }
      writeGeometry(document, object.id, nextGeometry);
      touch(document, object.id, command.issuedAt);
      return;
    }

    if (command.type === "object.move") {
      const requestedGeometry = {
        ...object.geometry,
        x: command.payload.x,
        y: command.payload.y,
      };
      let movedGeometry =
        isContainableObject(object) && object.parentId
          ? clampObjectGeometryToParent(
              requestedGeometry,
              requireObjectParent(document, object.parentId),
            )
          : requestedGeometry;
      if (isObjectParent(object)) {
        movedGeometry = updateChildrenForParentGeometry(
          document,
          object,
          movedGeometry,
          false,
          command.issuedAt,
          affectedObjectIds,
        );
      }
      const dx = movedGeometry.x - object.geometry.x;
      const dy = movedGeometry.y - object.geometry.y;
      setCanvasObjectField(
        document,
        object.id,
        ["geometry", "x"],
        movedGeometry.x,
      );
      setCanvasObjectField(
        document,
        object.id,
        ["geometry", "y"],
        movedGeometry.y,
      );
      if (isContainableObject(object) && object.parentId) {
        const parent = requireObjectParent(document, object.parentId);
        setCanvasObjectField(
          document,
          object.id,
          ["parentRelative"],
          parentRelativeGeometry(movedGeometry, parent),
        );
      }
      if (object.type === "annotation" && object.attachedObjectId) {
        const target = requireEligibleAnnotationTarget(
          document,
          object.id,
          object.attachedObjectId,
        );
        setCanvasObjectField(document, object.id, ["attachmentOffset"], {
          x: command.payload.x - target.geometry.x,
          y: command.payload.y - target.geometry.y,
        });
      } else if (isEligibleAnnotationTarget(object) && (dx !== 0 || dy !== 0)) {
        for (const candidate of listCanvasObjectsV2(document)) {
          if (
            candidate.type !== "annotation" ||
            candidate.attachedObjectId !== object.id
          ) {
            continue;
          }
          setCanvasObjectField(
            document,
            candidate.id,
            ["geometry", "x"],
            candidate.geometry.x + dx,
          );
          setCanvasObjectField(
            document,
            candidate.id,
            ["geometry", "y"],
            candidate.geometry.y + dy,
          );
          touch(document, candidate.id, command.issuedAt);
          affectedObjectIds.add(candidate.id);
        }
      }
    } else if (command.type === "object.resize") {
      const minimumSize = object.type === "icon" ? 8 : 24;
      if (
        command.payload.width < minimumSize ||
        command.payload.height < minimumSize
      ) {
        throw new ProductCanvasCommandConflictError(
          `This object must remain at least ${minimumSize}px wide and high.`,
        );
      }
      if (object.type === "annotation" && !object.baseWidth) {
        setCanvasObjectField(
          document,
          object.id,
          ["baseWidth"],
          object.geometry.width,
        );
        setCanvasObjectField(
          document,
          object.id,
          ["baseHeight"],
          object.geometry.height,
        );
      }
      const resizedGeometry =
        isContainableObject(object) && object.parentId
          ? clampObjectGeometryToParent(
              {
                ...object.geometry,
                width: command.payload.width,
                height: command.payload.height,
              },
              requireObjectParent(document, object.parentId),
            )
          : {
              ...object.geometry,
              width: command.payload.width,
              height: command.payload.height,
            };
      const nextGeometry = isObjectParent(object)
        ? updateChildrenForParentGeometry(
            document,
            object,
            resizedGeometry,
            false,
            command.issuedAt,
            affectedObjectIds,
          )
        : resizedGeometry;
      writeGeometry(document, object.id, nextGeometry);
      if (isContainableObject(object) && object.parentId) {
        const parent = requireObjectParent(document, object.parentId);
        setCanvasObjectField(
          document,
          object.id,
          ["parentRelative"],
          parentRelativeGeometry(nextGeometry, parent),
        );
      }
    } else if (command.type === "object.rotate") {
      if (!isContainableObject(object)) {
        throw new ProductCanvasCommandConflictError(
          "Only shapes, icons, and text can be rotated.",
        );
      }
      const geometry = rotateGeometryAroundCenter(
        object.geometry,
        command.payload.rotation,
      );
      if (isObjectParent(object)) {
        updateChildrenForParentGeometry(
          document,
          object,
          geometry,
          false,
          command.issuedAt,
          affectedObjectIds,
        );
      }
      writeGeometry(document, object.id, geometry);
      if (object.parentId) {
        const parent = requireObjectParent(document, object.parentId);
        setCanvasObjectField(
          document,
          object.id,
          ["parentRelative"],
          parentRelativeGeometry(geometry, parent),
        );
      }
      updateAttachedAnnotationPosition(
        document,
        object.id,
        geometry.x - object.geometry.x,
        geometry.y - object.geometry.y,
        command.issuedAt,
        affectedObjectIds,
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
      if (
        object.type === "annotation" &&
        command.payload.style.outlinePattern &&
        command.payload.style.outlinePattern !== "solid"
      ) {
        throw new ProductCanvasCommandConflictError(
          "Freeform annotations use a solid pressure-rendered stroke.",
        );
      }
      if (
        object.type === "annotation" &&
        command.payload.style.outlineWidth === 0
      ) {
        throw new ProductCanvasCommandConflictError(
          "Freeform annotations require a visible stroke thickness.",
        );
      }
      for (const [field, value] of Object.entries(command.payload.style)) {
        setCanvasObjectField(document, object.id, ["style", field], value);
      }
    } else if (command.type === "annotation.promote") {
      if (object.type !== "annotation") {
        throw new ProductCanvasCommandConflictError(
          "Only annotations can be promoted.",
        );
      }
      if (!object.temporary) return;
      setCanvasObjectField(document, object.id, ["temporary"], false);
    } else if (command.type === "annotation.attach") {
      if (object.type !== "annotation") {
        throw new ProductCanvasCommandConflictError(
          "Only annotations can be attached.",
        );
      }
      const target = requireEligibleAnnotationTarget(
        document,
        object.id,
        command.payload.targetObjectId,
      );
      setCanvasObjectField(
        document,
        object.id,
        ["attachedObjectId"],
        target.id,
      );
      setCanvasObjectField(document, object.id, ["attachmentOffset"], {
        x: object.geometry.x - target.geometry.x,
        y: object.geometry.y - target.geometry.y,
      });
    } else if (command.type === "annotation.disconnect") {
      if (object.type !== "annotation") {
        throw new ProductCanvasCommandConflictError(
          "Only annotations can be disconnected.",
        );
      }
      if (!object.attachedObjectId) return;
      setCanvasObjectField(document, object.id, ["attachedObjectId"], null);
      setCanvasObjectField(document, object.id, ["attachmentOffset"], null);
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
      const deleteIds = new Set([object.id]);
      if (isObjectParent(object)) {
        let added = true;
        while (added) {
          added = false;
          for (const candidate of objectsById.values()) {
            if (
              isContainableObject(candidate) &&
              candidate.parentId &&
              deleteIds.has(candidate.parentId) &&
              !deleteIds.has(candidate.id)
            ) {
              deleteIds.add(candidate.id);
              added = true;
            }
          }
        }
      }
      for (const candidate of objectsById.values()) {
        if (deleteIds.has(candidate.id)) continue;
        if (
          candidate.type === "annotation" &&
          candidate.attachedObjectId &&
          deleteIds.has(candidate.attachedObjectId)
        ) {
          setCanvasObjectField(
            document,
            candidate.id,
            ["attachedObjectId"],
            null,
          );
          setCanvasObjectField(
            document,
            candidate.id,
            ["attachmentOffset"],
            null,
          );
          touch(document, candidate.id, command.issuedAt);
          affectedObjectIds.add(candidate.id);
          continue;
        }
        if (candidate.type === "connector") {
          for (const endpoint of ["start", "end"] as const) {
            const value = candidate[endpoint];
            if (value.kind !== "attached" || !deleteIds.has(value.objectId))
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
      }
      for (const objectId of [...deleteIds].reverse()) {
        deleteCanvasObjectV2(document, objectId);
        affectedObjectIds.add(objectId);
      }
      return;
    }

    touch(document, object.id, command.issuedAt);
  }, command.commandId);

  return { command, affectedObjectIds: [...affectedObjectIds] };
}
