import * as Y from "yjs";
import { z } from "zod";

import { phosphorIconNames } from "@/canvas/phosphor-icon-names";
import { canvasObjectSchema, type CanvasObject } from "@/domain/canvas-object";

const metadataMapName = "canvas-metadata-v2";
const objectsMapName = "canvas-objects-v2";
const orderArrayName = "canvas-order-v2";

const uuid = z.uuid();
const finiteNumber = z.number().finite();
const color = z.string().min(1).max(100);
const textLink = z
  .url()
  .max(2_048)
  .refine(
    (value) => value.startsWith("https://") || value.startsWith("http://"),
    {
      message: "Canvas text links must use HTTP or HTTPS.",
    },
  );

const geometrySchema = z.strictObject({
  x: finiteNumber,
  y: finiteNumber,
  width: finiteNumber.nonnegative(),
  height: finiteNumber.nonnegative(),
  rotation: finiteNumber.default(0),
  flipX: z.boolean().optional(),
  flipY: z.boolean().optional(),
});

const styleSchema = z.strictObject({
  fill: color.nullable(),
  outline: color,
  outlineWidth: finiteNumber.nonnegative().max(20),
  outlinePattern: z.enum(["solid", "dashed", "dotted"]).optional(),
  fontFamily: z.string().min(1).max(200),
  fontSize: finiteNumber.min(8).max(400),
  fontWeight: z.enum(["normal", "bold"]).optional(),
  textAlign: z.enum(["left", "center", "right"]).optional(),
  listStyle: z.enum(["none", "bullet", "numbered"]).optional(),
  linkUrl: textLink.nullable().optional(),
  textColor: color.optional(),
  opacity: finiteNumber.min(0).max(1).optional(),
});

const canvasObjectBaseSchema = z.strictObject({
  schemaVersion: z.literal(2),
  id: uuid,
  canvasId: uuid,
  createdBy: uuid,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  groupId: uuid.nullable().optional(),
  geometry: geometrySchema,
  style: styleSchema,
});

const connectorEndpointSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("free"),
    x: finiteNumber,
    y: finiteNumber,
  }),
  z.strictObject({
    kind: z.literal("attached"),
    objectId: uuid,
    anchor: z.enum(["top", "right", "bottom", "left", "center"]),
  }),
]);

const parentRelativeSchema = z.strictObject({
  x: finiteNumber,
  y: finiteNumber,
  width: finiteNumber.nonnegative().max(1),
  height: finiteNumber.nonnegative().max(1),
  rotation: finiteNumber.optional(),
});

const childLayoutSchema = z.strictObject({
  pinPosition: z.boolean(),
  scaleWidth: z.boolean(),
  scaleHeight: z.boolean(),
});

const containmentFields = {
  parentId: uuid.nullable().optional(),
  parentRelative: parentRelativeSchema.nullable().optional(),
  childLayout: childLayoutSchema.nullable().optional(),
};

const shapeObjectSchema = canvasObjectBaseSchema.extend({
  type: z.literal("shape"),
  shape: z.enum([
    "rectangle",
    "rounded-rectangle",
    "ellipse",
    "diamond",
    "triangle",
    "pentagon",
    "hexagon",
    "octagon",
    "star",
    "cloud",
    "speech-bubble",
    "cylinder",
  ]),
  text: z.string().max(10_000),
  ...containmentFields,
});

const iconObjectSchema = canvasObjectBaseSchema.extend({
  type: z.literal("icon"),
  catalog: z.literal("phosphor"),
  catalogVersion: z.literal("2.1.1"),
  iconName: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(100)
    .refine((name) => phosphorIconNames.has(name), "Unknown icon name."),
  iconVariant: z.literal("fill"),
  ...containmentFields,
});

const textObjectSchema = canvasObjectBaseSchema.extend({
  type: z.literal("text"),
  text: z.string().max(100_000),
  childRole: z.literal("shape-label").nullable().optional(),
  ...containmentFields,
});

const connectorObjectSchema = canvasObjectBaseSchema.extend({
  type: z.literal("connector"),
  start: connectorEndpointSchema,
  end: connectorEndpointSchema,
});

const tableObjectSchema = canvasObjectBaseSchema.extend({
  type: z.literal("table"),
  cells: z
    .array(z.array(z.string().max(10_000)))
    .min(1)
    .max(100),
});

const legacyDocumentObjectSchema = canvasObjectBaseSchema.extend({
  type: z.literal("document"),
  documentId: uuid,
  title: z.string().max(500),
});

const legacyAnnotationObjectSchema = canvasObjectBaseSchema.extend({
  type: z.literal("annotation"),
  points: z.array(finiteNumber).min(4).max(20_000),
  pressures: z.array(finiteNumber.min(0).max(1)).min(2).max(10_000).optional(),
  strokeVersion: z.literal(1).optional(),
  pointerType: z.enum(["mouse", "touch", "pen"]).optional(),
  ink: z.enum(["pen", "highlighter"]).optional(),
  baseWidth: finiteNumber.positive().optional(),
  baseHeight: finiteNumber.positive().optional(),
  temporary: z.boolean(),
  attachedObjectId: uuid.nullable(),
  attachmentOffset: z
    .strictObject({ x: finiteNumber, y: finiteNumber })
    .nullable()
    .optional(),
});

export const canvasObjectV2Schema = z
  .discriminatedUnion("type", [
    shapeObjectSchema,
    iconObjectSchema,
    textObjectSchema,
    connectorObjectSchema,
    tableObjectSchema,
    legacyDocumentObjectSchema,
    legacyAnnotationObjectSchema,
  ])
  .superRefine((object, context) => {
    if (
      object.type === "shape" ||
      object.type === "icon" ||
      object.type === "text"
    ) {
      const parentId = object.parentId ?? null;
      const parentRelative = object.parentRelative ?? null;
      if ((parentId === null) !== (parentRelative === null)) {
        context.addIssue({
          code: "custom",
          path: ["parentRelative"],
          message: "Parented objects require normalized parent geometry.",
        });
      }
      if (
        parentRelative &&
        (parentRelative.x < 0 ||
          parentRelative.y < 0 ||
          parentRelative.x + parentRelative.width > 1 ||
          parentRelative.y + parentRelative.height > 1)
      ) {
        context.addIssue({
          code: "custom",
          path: ["parentRelative"],
          message: "Nested object geometry must remain inside its parent.",
        });
      }
      return;
    }
    if (object.type !== "annotation") return;
    if (object.points.length % 2 !== 0) {
      context.addIssue({
        code: "custom",
        path: ["points"],
        message: "Annotation points must contain complete coordinate pairs.",
      });
    }
    if (
      object.pressures &&
      object.pressures.length !== object.points.length / 2
    ) {
      context.addIssue({
        code: "custom",
        path: ["pressures"],
        message: "Annotation pressure must match the point count.",
      });
    }
  });

export type CanvasObjectV2 = z.infer<typeof canvasObjectV2Schema>;

export function isIntrinsicShapeLabel(
  object: CanvasObjectV2,
): object is Extract<CanvasObjectV2, { type: "text" }> {
  return object.type === "text" && object.childRole === "shape-label";
}

export function projectCanvasCompositions(objects: CanvasObjectV2[]) {
  const labelsByParentId = new Map(
    objects.flatMap((object) =>
      isIntrinsicShapeLabel(object) && object.parentId
        ? [[object.parentId, object] as const]
        : [],
    ),
  );
  return objects.flatMap((object) => {
    if (isIntrinsicShapeLabel(object)) return [];
    if (object.type !== "shape" || object.text) return [object];
    const label = labelsByParentId.get(object.id);
    return label ? [{ ...object, text: label.text }] : [object];
  });
}

function resolveParentRelativeGeometry(
  object: CanvasObjectV2,
  candidates: ReadonlyMap<string, CanvasObjectV2>,
): CanvasObjectV2 {
  if (
    (object.type !== "shape" &&
      object.type !== "icon" &&
      object.type !== "text") ||
    !object.parentId ||
    !object.parentRelative
  )
    return object;
  const parent = candidates.get(object.parentId);
  if (parent?.type !== "shape") return object;
  const localX = object.parentRelative.x * parent.geometry.width;
  const localY = object.parentRelative.y * parent.geometry.height;
  const radians = (parent.geometry.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    ...object,
    geometry: {
      ...object.geometry,
      x: parent.geometry.x + localX * cos - localY * sin,
      y: parent.geometry.y + localX * sin + localY * cos,
      width: object.parentRelative.width * parent.geometry.width,
      height: object.parentRelative.height * parent.geometry.height,
      rotation:
        parent.geometry.rotation + (object.parentRelative.rotation ?? 0),
    },
  };
}

export const canvasDocumentMetadataSchema = z.strictObject({
  schemaVersion: z.literal(2),
  canvasId: uuid,
});

type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toSharedValue(value: JsonValue): unknown {
  if (Array.isArray(value)) {
    const array = new Y.Array<unknown>();
    array.insert(0, value.map(toSharedValue));
    return array;
  }

  if (isRecord(value)) {
    const map = new Y.Map<unknown>();
    for (const [key, child] of Object.entries(value)) {
      map.set(key, toSharedValue(child as JsonValue));
    }
    return map;
  }

  return value;
}

function fromSharedValue(value: unknown): JsonValue {
  if (value instanceof Y.Map) {
    return Object.fromEntries(
      [...value.entries()].map(([key, child]) => [key, fromSharedValue(child)]),
    );
  }

  if (value instanceof Y.Array) {
    return value.toArray().map(fromSharedValue);
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  throw new Error("Canvas document contains an unsupported shared value.");
}

function metadata(document: Y.Doc) {
  return document.getMap<unknown>(metadataMapName);
}

function objects(document: Y.Doc) {
  return document.getMap<Y.Map<unknown>>(objectsMapName);
}

function order(document: Y.Doc) {
  return document.getArray<string>(orderArrayName);
}

function defaultStyle(type: CanvasObject["type"]) {
  return {
    fill: type === "connector" || type === "annotation" ? null : "#ffffff",
    outline: type === "annotation" ? "#f59e0b" : "#334155",
    outlineWidth: type === "annotation" ? 3 : 2,
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    fontSize: 16,
    fontWeight: "normal" as const,
    textAlign: type === "shape" ? ("center" as const) : ("left" as const),
    listStyle: "none" as const,
    linkUrl: null,
    textColor: "#18181b",
  };
}

function freeEndpoint(points: number[], offset: number) {
  return {
    kind: "free" as const,
    x: points[offset] ?? 0,
    y: points[offset + 1] ?? 0,
  };
}

export function adaptCanvasObjectV1(object: CanvasObject): CanvasObjectV2 {
  if (object.type === "connector") {
    const { points, startObjectId, endObjectId, ...legacyBase } = object;
    const lastPoint = Math.max(0, object.points.length - 2);
    return canvasObjectV2Schema.parse({
      ...legacyBase,
      schemaVersion: 2,
      style: defaultStyle(object.type),
      start: startObjectId
        ? {
            kind: "attached",
            objectId: startObjectId,
            anchor: "center",
          }
        : freeEndpoint(points, 0),
      end: endObjectId
        ? {
            kind: "attached",
            objectId: endObjectId,
            anchor: "center",
          }
        : freeEndpoint(points, lastPoint),
    });
  }

  return canvasObjectV2Schema.parse({
    ...object,
    schemaVersion: 2,
    style: defaultStyle(object.type),
  });
}

export function initializeCanvasDocument(document: Y.Doc, canvasId: string) {
  const current = metadata(document).get("schemaVersion");

  if (current !== undefined) {
    const parsed = canvasDocumentMetadataSchema.parse(
      fromSharedValue(metadata(document)),
    );
    if (parsed.canvasId !== canvasId) {
      throw new Error("Canvas document identity does not match its route.");
    }
    return;
  }

  document.transact(() => {
    metadata(document).set("schemaVersion", 2);
    metadata(document).set("canvasId", canvasId);
    objects(document);
    order(document);
  }, "canvas.initialize");
}

export function createProductCanvasDocument(canvasId: string) {
  const document = new Y.Doc();
  initializeCanvasDocument(document, canvasId);
  return document;
}

export function readCanvasDocumentMetadata(document: Y.Doc) {
  return canvasDocumentMetadataSchema.parse(
    fromSharedValue(metadata(document)),
  );
}

export function putCanvasObjectV2(
  document: Y.Doc,
  objectInput: CanvasObjectV2,
) {
  const object = canvasObjectV2Schema.parse(objectInput);
  const documentMetadata = readCanvasDocumentMetadata(document);

  if (object.canvasId !== documentMetadata.canvasId) {
    throw new Error("Canvas object identity does not match its document.");
  }

  document.transact(() => {
    const existingObjectMap = objects(document).get(object.id);
    const objectMap = existingObjectMap ?? new Y.Map<unknown>();
    const existingKeys = new Set(existingObjectMap?.keys() ?? []);

    for (const [key, value] of Object.entries(object)) {
      if (value === undefined) {
        objectMap.delete(key);
        existingKeys.delete(key);
        continue;
      }
      objectMap.set(key, toSharedValue(value as JsonValue));
      existingKeys.delete(key);
    }

    for (const key of existingKeys) objectMap.delete(key);
    if (!existingObjectMap) objects(document).set(object.id, objectMap);

    if (!order(document).toArray().includes(object.id)) {
      order(document).push([object.id]);
    }
  }, "canvas.object.put");
}

export function readCanvasObjectV2(document: Y.Doc, objectId: string) {
  const initialValue = objects(document).get(objectId);
  if (!initialValue) return undefined;
  const initial = canvasObjectV2Schema.parse(fromSharedValue(initialValue));
  const candidates = new Map<string, CanvasObjectV2>();
  candidates.set(initial.id, initial);
  let nextId: string | null =
    (initial.type === "shape" ||
      initial.type === "icon" ||
      initial.type === "text") &&
    initial.parentId
      ? initial.parentId
      : null;
  while (nextId && !candidates.has(nextId)) {
    const value = objects(document).get(nextId);
    if (!value) break;
    const parsed = canvasObjectV2Schema.safeParse(fromSharedValue(value));
    if (!parsed.success) break;
    candidates.set(parsed.data.id, parsed.data);
    nextId =
      (parsed.data.type === "shape" ||
        parsed.data.type === "icon" ||
        parsed.data.type === "text") &&
      parsed.data.parentId
        ? parsed.data.parentId
        : null;
  }
  const object = candidates.get(objectId)!;
  const lineage = [...candidates.values()].reverse();
  const resolved = new Map<string, CanvasObjectV2>();
  for (const candidate of lineage) {
    resolved.set(
      candidate.id,
      resolveParentRelativeGeometry(candidate, resolved),
    );
  }
  return resolved.get(objectId) ?? object;
}

export function listCanvasObjectsV2(document: Y.Doc) {
  const objectMap = objects(document);
  // Concurrent clients can both append the same deterministic object id before
  // their Y.Array updates converge. The object map correctly converges to one
  // object, so render and command consumers must likewise expose one order slot.
  const orderedIds = [...new Set(order(document).toArray())];
  const orphanIds = [...objectMap.keys()]
    .filter((id) => !orderedIds.includes(id))
    .sort();

  const parsed = [...orderedIds, ...orphanIds].flatMap((id) => {
    const value = objectMap.get(id);
    if (!value) return [];
    try {
      const object = canvasObjectV2Schema.safeParse(fromSharedValue(value));
      return object.success ? [object.data] : [];
    } catch {
      return [];
    }
  });
  const parsedById = new Map(parsed.map((object) => [object.id, object]));
  const resolvedById = new Map<string, CanvasObjectV2>();
  function resolveObject(object: CanvasObjectV2, active = new Set<string>()) {
    const existing = resolvedById.get(object.id);
    if (existing) return existing;
    if (
      active.has(object.id) ||
      (object.type !== "shape" &&
        object.type !== "icon" &&
        object.type !== "text") ||
      !object.parentId
    ) {
      resolvedById.set(object.id, object);
      return object;
    }
    const parent = parsedById.get(object.parentId);
    if (!parent) return object;
    const nextActive = new Set(active).add(object.id);
    const resolvedParent = resolveObject(parent, nextActive);
    const resolved = resolveParentRelativeGeometry(
      object,
      new Map([[resolvedParent.id, resolvedParent]]),
    );
    resolvedById.set(object.id, resolved);
    return resolved;
  }
  return parsed.map((object) => resolveObject(object));
}

function legacyShapeLabelId(shapeId: string) {
  const source = shapeId.replaceAll("-", "");
  const mask = "9e3779b97f4a4c1585ebca6b2f4d3817";
  const mixed = [...source].map((value, index) =>
    (Number.parseInt(value, 16) ^ Number.parseInt(mask[index]!, 16)).toString(
      16,
    ),
  );
  mixed[12] = "4";
  mixed[16] = "8";
  return `${mixed.slice(0, 8).join("")}-${mixed.slice(8, 12).join("")}-${mixed.slice(12, 16).join("")}-${mixed.slice(16, 20).join("")}-${mixed.slice(20).join("")}`;
}

export function migrateLegacyShapeLabels(document: Y.Doc) {
  const current = listCanvasObjectsV2(document);
  const existingLabelsByParent = new Map(
    current.flatMap((object) =>
      object.type === "text" &&
      object.childRole === "shape-label" &&
      object.parentId
        ? [[object.parentId, object] as const]
        : [],
    ),
  );
  const legacyShapes = current.flatMap((object) =>
    object.type === "shape" &&
    object.text.length > 0 &&
    !existingLabelsByParent.has(object.id)
      ? [object]
      : [],
  );
  const synchronizedShapes = current.flatMap((object) =>
    object.type === "shape" &&
    object.text.length > 0 &&
    existingLabelsByParent.has(object.id)
      ? [object]
      : [],
  );
  if (!legacyShapes.length && !synchronizedShapes.length) return 0;

  document.transact(() => {
    for (const shape of synchronizedShapes) {
      const label = existingLabelsByParent.get(shape.id)!;
      setCanvasObjectField(document, label.id, ["text"], shape.text);
      setCanvasObjectField(document, shape.id, ["text"], "");
    }
    for (const shape of legacyShapes) {
      const insetX = Math.min(12, shape.geometry.width / 4);
      const insetY = Math.min(12, shape.geometry.height / 4);
      const relative = {
        x: insetX / Math.max(shape.geometry.width, Number.EPSILON),
        y: insetY / Math.max(shape.geometry.height, Number.EPSILON),
        width:
          Math.max(0, shape.geometry.width - insetX * 2) /
          Math.max(shape.geometry.width, Number.EPSILON),
        height:
          Math.max(0, shape.geometry.height - insetY * 2) /
          Math.max(shape.geometry.height, Number.EPSILON),
        rotation: 0,
      };
      const radians = (shape.geometry.rotation * Math.PI) / 180;
      const localX = insetX * Math.cos(radians) - insetY * Math.sin(radians);
      const localY = insetX * Math.sin(radians) + insetY * Math.cos(radians);
      putCanvasObjectV2(document, {
        schemaVersion: 2,
        id: legacyShapeLabelId(shape.id),
        canvasId: shape.canvasId,
        createdBy: shape.createdBy,
        createdAt: shape.createdAt,
        updatedAt: shape.updatedAt,
        type: "text",
        text: shape.text,
        childRole: "shape-label",
        parentId: shape.id,
        parentRelative: relative,
        childLayout: {
          pinPosition: true,
          scaleWidth: true,
          scaleHeight: true,
        },
        geometry: {
          x: shape.geometry.x + localX,
          y: shape.geometry.y + localY,
          width: Math.max(24, shape.geometry.width - insetX * 2),
          height: Math.max(24, shape.geometry.height - insetY * 2),
          rotation: shape.geometry.rotation,
        },
        style: {
          ...shape.style,
          fill: null,
          outlineWidth: 0,
        },
      });
      setCanvasObjectField(document, shape.id, ["text"], "");
    }
  }, "canvas.shape-labels.migrate");
  return legacyShapes.length;
}

export function readCanvasOrderV2(document: Y.Doc) {
  return [...new Set(order(document).toArray())];
}

export function setCanvasOrderV2(document: Y.Doc, objectIds: string[]) {
  const currentIds = [...objects(document).keys()].sort();
  const proposedIds = [...objectIds].sort();
  if (
    currentIds.length !== proposedIds.length ||
    currentIds.some((id, index) => id !== proposedIds[index])
  ) {
    throw new Error("Canvas order must contain every object exactly once.");
  }

  document.transact(() => {
    const currentOrder = order(document);
    currentOrder.delete(0, currentOrder.length);
    currentOrder.push(objectIds);
  }, "canvas.order.set");
}

export function deleteCanvasObjectV2(document: Y.Doc, objectId: string) {
  const existing = readCanvasObjectV2(document, objectId);
  if (!existing) return undefined;

  document.transact(() => {
    objects(document).delete(objectId);
    const currentOrder = order(document);
    for (let index = currentOrder.length - 1; index >= 0; index -= 1) {
      if (currentOrder.get(index) === objectId) currentOrder.delete(index, 1);
    }
  }, "canvas.object.delete");

  return existing;
}

function patchRecord(
  value: Record<string, unknown>,
  path: string[],
  replacement: JsonValue,
): Record<string, unknown> {
  const [key, ...remaining] = path;
  if (!key) throw new Error("A canvas object field path is required.");

  if (remaining.length === 0) {
    return { ...value, [key]: replacement };
  }

  const child = value[key];
  if (!isRecord(child)) {
    throw new Error("Canvas object field path does not resolve to a map.");
  }

  return { ...value, [key]: patchRecord(child, remaining, replacement) };
}

export function setCanvasObjectField(
  document: Y.Doc,
  objectId: string,
  path: string[],
  replacement: JsonValue,
) {
  const current = readCanvasObjectV2(document, objectId);
  if (!current) throw new Error("Canvas object does not exist.");

  const next = canvasObjectV2Schema.parse(
    patchRecord(current, path, replacement),
  );
  let target: Y.Map<unknown> = objects(document).get(objectId)!;

  for (const segment of path.slice(0, -1)) {
    const child = target.get(segment);
    if (!(child instanceof Y.Map)) {
      throw new Error("Canvas object field path does not resolve to a map.");
    }
    target = child;
  }

  const leaf = path.at(-1);
  if (!leaf) throw new Error("A canvas object field path is required.");
  target.set(leaf, toSharedValue(replacement));

  return next;
}

export function upgradeCanvasDocumentV1(document: Y.Doc, canvasId: string) {
  const currentVersion = metadata(document).get("schemaVersion");
  if (currentVersion !== undefined) {
    initializeCanvasDocument(document, canvasId);
    return false;
  }

  const legacyObjects = [...document.getMap<unknown>("canvas-objects").values()]
    .map((value) => canvasObjectSchema.parse(value))
    .sort((left, right) => left.id.localeCompare(right.id));

  for (const object of legacyObjects) {
    if (object.canvasId !== canvasId) {
      throw new Error("Legacy canvas object belongs to another canvas.");
    }
  }

  document.transact(() => {
    initializeCanvasDocument(document, canvasId);
    for (const object of legacyObjects) {
      putCanvasObjectV2(document, adaptCanvasObjectV1(object));
    }
  }, "canvas.upgrade.v1-to-v2");

  return true;
}
