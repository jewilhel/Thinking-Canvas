import * as Y from "yjs";
import { z } from "zod";

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
});

const iconObjectSchema = canvasObjectBaseSchema.extend({
  type: z.literal("icon"),
  catalog: z.literal("phosphor"),
  catalogVersion: z.literal("2.1.1"),
  iconName: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(100),
  iconVariant: z.literal("fill"),
  parentId: uuid.nullable(),
  parentRelative: z
    .strictObject({
      x: finiteNumber,
      y: finiteNumber,
      width: finiteNumber.nonnegative(),
      height: finiteNumber.nonnegative(),
    })
    .nullable(),
});

const textObjectSchema = canvasObjectBaseSchema.extend({
  type: z.literal("text"),
  text: z.string().max(100_000),
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
  const value = objects(document).get(objectId);
  return value ? canvasObjectV2Schema.parse(fromSharedValue(value)) : undefined;
}

export function listCanvasObjectsV2(document: Y.Doc) {
  const objectMap = objects(document);
  const orderedIds = order(document).toArray();
  const orphanIds = [...objectMap.keys()]
    .filter((id) => !orderedIds.includes(id))
    .sort();

  return [...orderedIds, ...orphanIds].flatMap((id) => {
    const value = objectMap.get(id);
    if (!value) return [];
    try {
      const object = canvasObjectV2Schema.safeParse(fromSharedValue(value));
      return object.success ? [object.data] : [];
    } catch {
      return [];
    }
  });
}

export function readCanvasOrderV2(document: Y.Doc) {
  return order(document).toArray();
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
    const index = order(document).toArray().indexOf(objectId);
    if (index >= 0) order(document).delete(index, 1);
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
