import { z } from "zod";
import type * as Y from "yjs";

import {
  canvasObjectV2Schema,
  deleteCanvasGroupV2,
  deleteCanvasObjectV2,
  listCanvasGroupsV2,
  listCanvasObjectsV2,
  putCanvasGroupV2,
  putCanvasObjectV2,
  readCanvasGroupV2,
  readCanvasDocumentMetadata,
  readCanvasObjectV2,
  readCanvasOrderV2,
  setCanvasObjectField,
  setCanvasGroupField,
  setCanvasOrderV2,
  type CanvasObjectV2,
} from "@/canvas/canvas-document";
import { resolveConnectorEndpointV2 } from "@/canvas/geometry";
import {
  boundParentGeometryToChildren,
  childConstraints,
  childRelativeAfterParentResize,
  childWorldGeometry,
  clampObjectGeometryToParent,
  defaultChildLayout,
  fullyContains,
  flipGeometryWithinParent,
  isContainableObject,
  isObjectParent,
  parentRelativeGeometry,
  reorderCanvasObjectLayer,
  rotateGeometryAroundCenter,
  type ContainableObject,
  type HorizontalConstraint,
  type ObjectParent,
  type VerticalConstraint,
} from "@/canvas/icon-containment";
import { isEligibleAnnotationTarget } from "@/canvas/annotation-attachment";
import {
  rotateSelectionObjects,
  selectionBoundsForObjects,
  transformSelectionObjects,
} from "@/canvas/selection-transform";

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
  payload: z
    .strictObject({
      objectId: uuid,
      horizontalConstraint: z
        .enum(["left", "right", "left-right", "center", "scale"])
        .optional(),
      verticalConstraint: z
        .enum(["top", "bottom", "top-bottom", "center", "scale"])
        .optional(),
      pinPosition: z.boolean().optional(),
      horizontalPosition: z.enum(["fixed", "pin", "center"]).optional(),
      verticalPosition: z.enum(["fixed", "pin", "center"]).optional(),
      scaleWidth: z.boolean().optional(),
      scaleHeight: z.boolean().optional(),
    })
    .superRefine((payload, context) => {
      const hasConstraints =
        payload.horizontalConstraint !== undefined &&
        payload.verticalConstraint !== undefined;
      const hasLegacyLayout =
        payload.scaleWidth !== undefined &&
        payload.scaleHeight !== undefined &&
        (payload.pinPosition !== undefined ||
          (payload.horizontalPosition !== undefined &&
            payload.verticalPosition !== undefined));
      if (!hasConstraints && !hasLegacyLayout) {
        context.addIssue({
          code: "custom",
          message:
            "Layout requires both constraints or a complete legacy layout.",
        });
      }
    }),
});
const layoutGroupCommand = commandBase.extend({
  type: z.literal("group.layout"),
  payload: z
    .strictObject({
      groupId: uuid,
      horizontalConstraint: z
        .enum(["left", "right", "left-right", "center", "scale"])
        .optional(),
      verticalConstraint: z
        .enum(["top", "bottom", "top-bottom", "center", "scale"])
        .optional(),
      horizontalPosition: z.enum(["fixed", "pin", "center"]).optional(),
      verticalPosition: z.enum(["fixed", "pin", "center"]).optional(),
      scaleWidth: z.boolean().optional(),
      scaleHeight: z.boolean().optional(),
    })
    .superRefine((payload, context) => {
      const hasConstraints =
        payload.horizontalConstraint !== undefined &&
        payload.verticalConstraint !== undefined;
      const hasLegacyLayout =
        payload.horizontalPosition !== undefined &&
        payload.verticalPosition !== undefined &&
        payload.scaleWidth !== undefined &&
        payload.scaleHeight !== undefined;
      if (!hasConstraints && !hasLegacyLayout) {
        context.addIssue({
          code: "custom",
          message:
            "Layout requires both constraints or a complete legacy layout.",
        });
      }
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
const rotateGroupCommand = commandBase.extend({
  type: z.literal("group.rotate"),
  payload: z.strictObject({ groupId: uuid, rotation: finiteNumber }),
});
const transformGroupCommand = commandBase.extend({
  type: z.literal("group.transform"),
  payload: z.strictObject({
    groupId: uuid,
    x: finiteNumber,
    y: finiteNumber,
    width: finiteNumber.min(1),
    height: finiteNumber.min(1),
  }),
});
const nestGroupCommand = commandBase.extend({
  type: z.literal("group.nest"),
  payload: z.strictObject({ groupId: uuid, parentId: uuid }),
});
const detachGroupCommand = commandBase.extend({
  type: z.literal("group.detach"),
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
  layoutGroupCommand.omit(trustedCommandFields),
  rotateObjectCommand.omit(trustedCommandFields),
  flipObjectCommand.omit(trustedCommandFields),
  transformObjectCommand.omit(trustedCommandFields),
  reorderCommand.omit(trustedCommandFields),
  groupCommand.omit(trustedCommandFields),
  ungroupCommand.omit(trustedCommandFields),
  rotateGroupCommand.omit(trustedCommandFields),
  transformGroupCommand.omit(trustedCommandFields),
  nestGroupCommand.omit(trustedCommandFields),
  detachGroupCommand.omit(trustedCommandFields),
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
    layoutGroupCommand,
    rotateObjectCommand,
    flipObjectCommand,
    transformObjectCommand,
    reorderCommand,
    groupCommand,
    ungroupCommand,
    rotateGroupCommand,
    transformGroupCommand,
    nestGroupCommand,
    detachGroupCommand,
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
  affectedGroupIds: Set<string>,
) {
  const allObjects = listCanvasObjectsV2(document);
  const children = allObjects.filter(
    (candidate): candidate is ContainableObject =>
      isContainableObject(candidate) && candidate.parentId === parent.id,
  );
  const childGroups = listCanvasGroupsV2(document).filter(
    (candidate) => candidate.parentId === parent.id,
  );
  const boundedGeometry = preserveChildren
    ? boundParentGeometryToChildren(parent, nextGeometry, [
        ...children,
        ...childGroups,
      ])
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
  for (const group of childGroups) {
    const relative = preserveChildren
      ? parentRelativeGeometry(group.geometry, nextParent)
      : childRelativeAfterParentResize(group, parent, nextParent);
    const nextGroupGeometry = childWorldGeometry(
      { ...group, parentRelative: relative },
      nextParent,
    );
    const members = allObjects.filter(
      (candidate) => candidate.groupId === group.id,
    );
    const rotatedMembers = rotateSelectionObjects(
      members,
      group.geometry,
      nextGroupGeometry.rotation,
    );
    const rotatedFrame = rotateGeometryAroundCenter(
      group.geometry,
      nextGroupGeometry.rotation,
    );
    for (const member of transformSelectionObjects(
      rotatedMembers,
      rotatedFrame,
      nextGroupGeometry,
    )) {
      if (member.type === "connector") continue;
      const previous = members.find((candidate) => candidate.id === member.id)!;
      writeGeometry(document, member.id, member.geometry);
      touch(document, member.id, issuedAt);
      affectedObjectIds.add(member.id);
      updateAttachedAnnotationPosition(
        document,
        member.id,
        member.geometry.x - previous.geometry.x,
        member.geometry.y - previous.geometry.y,
        issuedAt,
        affectedObjectIds,
        allObjects,
      );
    }
    setCanvasGroupField(document, group.id, ["parentRelative"], relative);
    for (const field of ["x", "y", "width", "height", "rotation"] as const) {
      setCanvasGroupField(
        document,
        group.id,
        ["geometry", field],
        nextGroupGeometry[field],
      );
    }
    setCanvasGroupField(document, group.id, ["updatedAt"], issuedAt);
    affectedGroupIds.add(group.id);
  }
  return boundedGeometry;
}

function tightUnrotatedGroupFrame(
  group: NonNullable<ReturnType<typeof readCanvasGroupV2>>,
  members: CanvasObjectV2[],
) {
  if (Math.abs(group.geometry.rotation % 360) >= 0.001) {
    return group.geometry;
  }
  const bounds = selectionBoundsForObjects(members);
  return bounds
    ? { ...group.geometry, ...bounds, rotation: 0 }
    : group.geometry;
}

function relativeGeometryForLayout(
  geometry: CanvasObjectV2["geometry"],
  parent: ObjectParent,
  horizontalConstraint: HorizontalConstraint,
  verticalConstraint: VerticalConstraint,
) {
  const relative = parentRelativeGeometry(geometry, parent);
  return {
    ...relative,
    x:
      horizontalConstraint === "center" ? 0.5 - relative.width / 2 : relative.x,
    y: verticalConstraint === "center" ? 0.5 - relative.height / 2 : relative.y,
  };
}

function constraintsFromLayoutPayload(payload: {
  horizontalConstraint?: HorizontalConstraint;
  verticalConstraint?: VerticalConstraint;
  pinPosition?: boolean;
  horizontalPosition?: "fixed" | "pin" | "center";
  verticalPosition?: "fixed" | "pin" | "center";
  scaleWidth?: boolean;
  scaleHeight?: boolean;
}) {
  if (payload.horizontalConstraint && payload.verticalConstraint) {
    return {
      horizontal: payload.horizontalConstraint,
      vertical: payload.verticalConstraint,
    };
  }
  return childConstraints({
    pinPosition: payload.pinPosition,
    horizontalPosition: payload.horizontalPosition,
    verticalPosition: payload.verticalPosition,
    scaleWidth: payload.scaleWidth,
    scaleHeight: payload.scaleHeight,
  });
}

export function executeProductCanvasCommand(document: Y.Doc, input: unknown) {
  const command = productCanvasCommandSchema.parse(input);
  if (readCanvasDocumentMetadata(document).canvasId !== command.canvasId) {
    throw new ProductCanvasCommandConflictError(
      "Command and document must target the same canvas.",
    );
  }

  const affectedObjectIds = new Set<string>();
  const affectedGroupIds = new Set<string>();
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
      const duplicatedGroupIds = new Set(
        command.payload.objects.flatMap((object) =>
          object.groupId ? [object.groupId] : [],
        ),
      );
      for (const groupId of duplicatedGroupIds) {
        if (readCanvasGroupV2(document, groupId)) continue;
        const members = command.payload.objects.filter(
          (object) => object.groupId === groupId,
        );
        if (members.length < 2) continue;
        const bounds = selectionBoundsForObjects(members);
        if (!bounds) continue;
        const memberParentIds = new Set(
          members.map((member) =>
            isContainableObject(member) ? (member.parentId ?? null) : null,
          ),
        );
        const sharedParentId =
          memberParentIds.size === 1 ? [...memberParentIds][0] : null;
        const parent = sharedParentId
          ? requireObjectParent(document, sharedParentId, pendingObjects)
          : null;
        if (parent) {
          for (const member of members) {
            if (!isContainableObject(member)) continue;
            putCanvasObjectV2(document, {
              ...member,
              parentId: null,
              parentRelative: null,
              childLayout: null,
            });
          }
        }
        putCanvasGroupV2(document, {
          schemaVersion: 2,
          id: groupId,
          canvasId: command.canvasId,
          createdBy: command.actor.id,
          createdAt: command.issuedAt,
          updatedAt: command.issuedAt,
          geometry: { ...bounds, rotation: 0 },
          parentId: parent?.id ?? null,
          parentRelative: parent
            ? parentRelativeGeometry({ ...bounds, rotation: 0 }, parent)
            : null,
          childLayout: parent ? defaultChildLayout : null,
        });
        affectedGroupIds.add(groupId);
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
      const parentIds = new Set(
        selected.map((object) =>
          isContainableObject(object) ? (object.parentId ?? null) : null,
        ),
      );
      if (parentIds.size !== 1) {
        throw new ProductCanvasCommandConflictError(
          "Grouped objects must share the same container level.",
        );
      }
      const sharedParentId = [...parentIds][0];
      if (
        sharedParentId &&
        selected.some((object) => !isContainableObject(object))
      ) {
        throw new ProductCanvasCommandConflictError(
          "Only shapes, icons, and text can be grouped inside a container.",
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
      const bounds = selectionBoundsForObjects(selected);
      if (!bounds) {
        throw new ProductCanvasCommandConflictError(
          "A group requires at least one spatial canvas object.",
        );
      }
      const parent = sharedParentId
        ? requireObjectParent(document, sharedParentId)
        : null;
      if (parent) {
        for (const object of selected) {
          if (!isContainableObject(object)) continue;
          putCanvasObjectV2(document, {
            ...object,
            groupId: command.payload.groupId,
            parentId: null,
            parentRelative: null,
            childLayout: null,
            updatedAt: command.issuedAt,
          });
        }
      }
      putCanvasGroupV2(document, {
        schemaVersion: 2,
        id: command.payload.groupId,
        canvasId: command.canvasId,
        createdBy: command.actor.id,
        createdAt: command.issuedAt,
        updatedAt: command.issuedAt,
        geometry: { ...bounds, rotation: 0 },
        parentId: parent?.id ?? null,
        parentRelative: parent
          ? parentRelativeGeometry({ ...bounds, rotation: 0 }, parent)
          : null,
        childLayout: parent ? defaultChildLayout : null,
      });
      affectedGroupIds.add(command.payload.groupId);
      return;
    }

    if (command.type === "selection.ungroup") {
      const frame = readCanvasGroupV2(document, command.payload.groupId);
      const grouped = listCanvasObjectsV2(document).filter(
        (object) => object.groupId === command.payload.groupId,
      );
      if (!grouped.length) {
        throw new ProductCanvasCommandConflictError(
          "The group does not exist.",
        );
      }
      for (const object of grouped) {
        if (frame?.parentId && isContainableObject(object)) {
          const parent = requireObjectParent(document, frame.parentId);
          putCanvasObjectV2(document, {
            ...object,
            groupId: null,
            parentId: parent.id,
            parentRelative: parentRelativeGeometry(object.geometry, parent),
            childLayout: frame.childLayout ?? defaultChildLayout,
          });
        } else {
          setCanvasObjectField(document, object.id, ["groupId"], null);
        }
        touch(document, object.id, command.issuedAt);
        affectedObjectIds.add(object.id);
      }
      deleteCanvasGroupV2(document, command.payload.groupId);
      affectedGroupIds.add(command.payload.groupId);
      return;
    }

    if (command.type === "group.rotate") {
      const members = listCanvasObjectsV2(document).filter(
        (object) => object.groupId === command.payload.groupId,
      );
      if (members.length < 2) {
        throw new ProductCanvasCommandConflictError(
          "The group does not have enough members to rotate.",
        );
      }
      let group = readCanvasGroupV2(document, command.payload.groupId);
      if (!group) {
        const bounds = selectionBoundsForObjects(members);
        if (!bounds) {
          throw new ProductCanvasCommandConflictError(
            "The group has no rotatable bounds.",
          );
        }
        group = {
          schemaVersion: 2,
          id: command.payload.groupId,
          canvasId: command.canvasId,
          createdBy: members[0]!.createdBy,
          createdAt: members[0]!.createdAt,
          updatedAt: command.issuedAt,
          geometry: { ...bounds, rotation: 0 },
          parentId: null,
          parentRelative: null,
          childLayout: null,
        };
        putCanvasGroupV2(document, group);
      }
      const sourceFrame = tightUnrotatedGroupFrame(group, members);
      const rotated = rotateSelectionObjects(
        members,
        sourceFrame,
        command.payload.rotation,
      );
      for (const member of rotated) {
        if (member.type === "connector") continue;
        const previous = members.find(
          (candidate) => candidate.id === member.id,
        )!;
        writeGeometry(document, member.id, member.geometry);
        touch(document, member.id, command.issuedAt);
        affectedObjectIds.add(member.id);
        updateAttachedAnnotationPosition(
          document,
          member.id,
          member.geometry.x - previous.geometry.x,
          member.geometry.y - previous.geometry.y,
          command.issuedAt,
          affectedObjectIds,
        );
      }
      const nextFrame = rotateGeometryAroundCenter(
        sourceFrame,
        command.payload.rotation,
      );
      for (const field of ["x", "y", "width", "height", "rotation"] as const) {
        setCanvasGroupField(
          document,
          group.id,
          ["geometry", field],
          nextFrame[field],
        );
      }
      setCanvasGroupField(document, group.id, ["updatedAt"], command.issuedAt);
      if (group.parentId) {
        const parent = requireObjectParent(document, group.parentId);
        setCanvasGroupField(
          document,
          group.id,
          ["parentRelative"],
          parentRelativeGeometry(nextFrame, parent),
        );
      }
      affectedGroupIds.add(group.id);
      return;
    }

    if (command.type === "group.transform") {
      const members = listCanvasObjectsV2(document).filter(
        (object) => object.groupId === command.payload.groupId,
      );
      if (members.length < 2) {
        throw new ProductCanvasCommandConflictError(
          "The group does not have enough members to transform.",
        );
      }
      let group = readCanvasGroupV2(document, command.payload.groupId);
      if (!group) {
        const bounds = selectionBoundsForObjects(members);
        if (!bounds) {
          throw new ProductCanvasCommandConflictError(
            "The group has no transformable bounds.",
          );
        }
        group = {
          schemaVersion: 2,
          id: command.payload.groupId,
          canvasId: command.canvasId,
          createdBy: members[0]!.createdBy,
          createdAt: members[0]!.createdAt,
          updatedAt: command.issuedAt,
          geometry: { ...bounds, rotation: 0 },
          parentId: null,
          parentRelative: null,
          childLayout: null,
        };
        putCanvasGroupV2(document, group);
      }
      const sourceFrame = tightUnrotatedGroupFrame(group, members);
      let target = {
        x: command.payload.x,
        y: command.payload.y,
        width: command.payload.width,
        height: command.payload.height,
      };
      if (group.parentId) {
        target = clampObjectGeometryToParent(
          { ...sourceFrame, ...target },
          requireObjectParent(document, group.parentId),
        );
      }
      for (const member of transformSelectionObjects(
        members,
        sourceFrame,
        target,
      )) {
        if (member.type === "connector") continue;
        const previous = members.find(
          (candidate) => candidate.id === member.id,
        )!;
        writeGeometry(document, member.id, member.geometry);
        touch(document, member.id, command.issuedAt);
        affectedObjectIds.add(member.id);
        updateAttachedAnnotationPosition(
          document,
          member.id,
          member.geometry.x - previous.geometry.x,
          member.geometry.y - previous.geometry.y,
          command.issuedAt,
          affectedObjectIds,
        );
      }
      for (const field of ["x", "y", "width", "height"] as const) {
        setCanvasGroupField(
          document,
          group.id,
          ["geometry", field],
          target[field],
        );
      }
      setCanvasGroupField(document, group.id, ["updatedAt"], command.issuedAt);
      if (group.parentId) {
        setCanvasGroupField(
          document,
          group.id,
          ["parentRelative"],
          parentRelativeGeometry(
            { ...sourceFrame, ...target },
            requireObjectParent(document, group.parentId),
          ),
        );
      }
      affectedGroupIds.add(group.id);
      return;
    }

    if (command.type === "group.nest") {
      const group = readCanvasGroupV2(document, command.payload.groupId);
      if (!group) {
        throw new ProductCanvasCommandConflictError(
          "The group does not have a durable frame.",
        );
      }
      const parent = requireObjectParent(document, command.payload.parentId);
      const members = listCanvasObjectsV2(document).filter(
        (object) => object.groupId === group.id,
      );
      if (
        members.length < 2 ||
        members.some(
          (member) => !isContainableObject(member) || member.parentId,
        )
      ) {
        throw new ProductCanvasCommandConflictError(
          "Only a complete top-level shape, icon, and text group can be nested.",
        );
      }
      const frame = tightUnrotatedGroupFrame(group, members);
      if (!fullyContains(parent, frame)) {
        throw new ProductCanvasCommandConflictError(
          "Move the complete group fully inside the container before placing it inside.",
        );
      }
      for (const field of ["x", "y", "width", "height", "rotation"] as const) {
        setCanvasGroupField(
          document,
          group.id,
          ["geometry", field],
          frame[field],
        );
      }
      setCanvasGroupField(document, group.id, ["parentId"], parent.id);
      setCanvasGroupField(
        document,
        group.id,
        ["parentRelative"],
        parentRelativeGeometry(frame, parent),
      );
      setCanvasGroupField(
        document,
        group.id,
        ["childLayout"],
        group.childLayout ?? defaultChildLayout,
      );
      setCanvasGroupField(document, group.id, ["updatedAt"], command.issuedAt);
      const memberIds = new Set(members.map((member) => member.id));
      const siblingGroupIds = new Set(
        listCanvasGroupsV2(document)
          .filter(
            (candidate) =>
              candidate.id !== group.id && candidate.parentId === parent.id,
          )
          .map((candidate) => candidate.id),
      );
      const order = readCanvasOrderV2(document).filter(
        (id) => !memberIds.has(id),
      );
      const siblingEnd = order.reduce((lastIndex, id, index) => {
        const sibling = readCanvasObjectV2(document, id);
        return sibling &&
          ((isContainableObject(sibling) && sibling.parentId === parent.id) ||
            (sibling.groupId && siblingGroupIds.has(sibling.groupId)))
          ? index
          : lastIndex;
      }, order.indexOf(parent.id));
      order.splice(siblingEnd + 1, 0, ...members.map((member) => member.id));
      setCanvasOrderV2(document, order);
      affectedGroupIds.add(group.id);
      return;
    }

    if (command.type === "group.detach") {
      const group = readCanvasGroupV2(document, command.payload.groupId);
      if (!group) {
        throw new ProductCanvasCommandConflictError(
          "The group does not exist.",
        );
      }
      if (!group.parentId) return;
      setCanvasGroupField(document, group.id, ["parentId"], null);
      setCanvasGroupField(document, group.id, ["parentRelative"], null);
      setCanvasGroupField(document, group.id, ["childLayout"], null);
      setCanvasGroupField(document, group.id, ["updatedAt"], command.issuedAt);
      affectedGroupIds.add(group.id);
      return;
    }

    if (command.type === "group.layout") {
      const group = readCanvasGroupV2(document, command.payload.groupId);
      if (!group?.parentId) {
        throw new ProductCanvasCommandConflictError(
          "Layout properties require a nested group.",
        );
      }
      const parent = requireObjectParent(document, group.parentId);
      const members = listCanvasObjectsV2(document).filter(
        (object) => object.groupId === group.id,
      );
      const currentFrame = tightUnrotatedGroupFrame(group, members);
      const constraints = constraintsFromLayoutPayload(command.payload);
      const relative = relativeGeometryForLayout(
        currentFrame,
        parent,
        constraints.horizontal,
        constraints.vertical,
      );
      const nextFrame = childWorldGeometry(
        { geometry: currentFrame, parentRelative: relative },
        parent,
      );
      for (const member of transformSelectionObjects(
        members,
        currentFrame,
        nextFrame,
      )) {
        if (member.type === "connector") continue;
        const previous = members.find(
          (candidate) => candidate.id === member.id,
        )!;
        writeGeometry(document, member.id, member.geometry);
        touch(document, member.id, command.issuedAt);
        affectedObjectIds.add(member.id);
        updateAttachedAnnotationPosition(
          document,
          member.id,
          member.geometry.x - previous.geometry.x,
          member.geometry.y - previous.geometry.y,
          command.issuedAt,
          affectedObjectIds,
        );
      }
      for (const field of ["x", "y", "width", "height", "rotation"] as const) {
        setCanvasGroupField(
          document,
          group.id,
          ["geometry", field],
          nextFrame[field],
        );
      }
      setCanvasGroupField(document, group.id, ["parentRelative"], relative);
      setCanvasGroupField(document, group.id, ["childLayout"], {
        horizontalConstraint: constraints.horizontal,
        verticalConstraint: constraints.vertical,
      });
      setCanvasGroupField(document, group.id, ["updatedAt"], command.issuedAt);
      affectedGroupIds.add(group.id);
      return;
    }

    if (command.type === "object.reorder") {
      const object = requireObject(document, command.payload.objectId);
      const allObjects = listCanvasObjectsV2(document);
      const allGroups = listCanvasGroupsV2(document);
      const nextOrder = reorderCanvasObjectLayer(
        allObjects,
        allGroups,
        object.id,
        command.payload.direction,
      );
      setCanvasOrderV2(document, nextOrder);
      const targetGroup = object.groupId
        ? readCanvasGroupV2(document, object.groupId)
        : undefined;
      const affectedIds = targetGroup
        ? allObjects
            .filter((candidate) => candidate.groupId === targetGroup.id)
            .map((candidate) => candidate.id)
        : isObjectParent(object)
          ? nextOrder.filter((id) => {
              const candidate = readCanvasObjectV2(document, id);
              if (id === object.id) return true;
              if (
                candidate &&
                isContainableObject(candidate) &&
                candidate.parentId === object.id
              ) {
                return true;
              }
              return candidate?.groupId
                ? readCanvasGroupV2(document, candidate.groupId)?.parentId ===
                    object.id
                : false;
            })
          : [object.id];
      for (const id of affectedIds) {
        touch(document, id, command.issuedAt);
        affectedObjectIds.add(id);
      }
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
      const constraints = constraintsFromLayoutPayload(command.payload);
      const parent = requireObjectParent(document, child.parentId);
      const relative = relativeGeometryForLayout(
        child.geometry,
        parent,
        constraints.horizontal,
        constraints.vertical,
      );
      const nextChild = childWorldGeometry(
        { ...child, parentRelative: relative },
        parent,
      );
      setCanvasObjectField(document, child.id, ["parentRelative"], relative);
      writeGeometry(document, child.id, nextChild);
      updateAttachedAnnotationPosition(
        document,
        child.id,
        nextChild.x - child.geometry.x,
        nextChild.y - child.geometry.y,
        command.issuedAt,
        affectedObjectIds,
      );
      setCanvasObjectField(document, child.id, ["childLayout"], {
        horizontalConstraint: constraints.horizontal,
        verticalConstraint: constraints.vertical,
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
          affectedGroupIds,
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
        for (const group of listCanvasGroupsV2(document).filter(
          (candidate) => candidate.parentId === object.id,
        )) {
          const nextGroup = flipGeometryWithinParent(
            group.geometry,
            object,
            command.payload.axis,
          );
          for (const member of allObjects.filter(
            (candidate) => candidate.groupId === group.id,
          )) {
            if (!isContainableObject(member)) continue;
            const nextMember = flipGeometryWithinParent(
              member.geometry,
              object,
              command.payload.axis,
            );
            writeGeometry(document, member.id, nextMember);
            touch(document, member.id, command.issuedAt);
            affectedObjectIds.add(member.id);
            updateAttachedAnnotationPosition(
              document,
              member.id,
              nextMember.x - member.geometry.x,
              nextMember.y - member.geometry.y,
              command.issuedAt,
              affectedObjectIds,
              allObjects,
            );
          }
          for (const field of [
            "x",
            "y",
            "rotation",
            "flipX",
            "flipY",
          ] as const) {
            const value = nextGroup[field];
            if (value !== undefined) {
              setCanvasGroupField(
                document,
                group.id,
                ["geometry", field],
                value,
              );
            }
          }
          setCanvasGroupField(
            document,
            group.id,
            ["parentRelative"],
            parentRelativeGeometry(nextGroup, object),
          );
          setCanvasGroupField(
            document,
            group.id,
            ["updatedAt"],
            command.issuedAt,
          );
          affectedGroupIds.add(group.id);
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
          affectedGroupIds,
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
            affectedGroupIds,
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
          affectedGroupIds,
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
        const nestedGroups = listCanvasGroupsV2(document).filter(
          (group) => group.parentId === object.id,
        );
        for (const group of nestedGroups) {
          for (const member of objectsById.values()) {
            if (member.groupId === group.id) deleteIds.add(member.id);
          }
          deleteCanvasGroupV2(document, group.id);
          affectedGroupIds.add(group.id);
        }
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

  return {
    command,
    affectedObjectIds: [...affectedObjectIds],
    affectedGroupIds: [...affectedGroupIds],
  };
}
