import { z } from "zod";

const uuid = z.uuid();
const finiteNumber = z.number().finite();

const geometrySchema = z.strictObject({
  x: finiteNumber,
  y: finiteNumber,
  width: finiteNumber.nonnegative(),
  height: finiteNumber.nonnegative(),
  rotation: finiteNumber.default(0),
});

const objectBaseSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: uuid,
  canvasId: uuid,
  createdBy: uuid,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  geometry: geometrySchema,
});

export const shapeObjectSchema = objectBaseSchema.extend({
  type: z.literal("shape"),
  shape: z.enum(["rectangle", "ellipse", "diamond"]),
  text: z.string().max(10_000).default(""),
});

export const textObjectSchema = objectBaseSchema.extend({
  type: z.literal("text"),
  text: z.string().max(100_000),
});

export const connectorObjectSchema = objectBaseSchema.extend({
  type: z.literal("connector"),
  startObjectId: uuid.nullable(),
  endObjectId: uuid.nullable(),
  points: z.array(finiteNumber).min(4).max(200),
});

export const tableObjectSchema = objectBaseSchema.extend({
  type: z.literal("table"),
  cells: z
    .array(z.array(z.string().max(10_000)))
    .min(1)
    .max(100),
});

export const documentObjectSchema = objectBaseSchema.extend({
  type: z.literal("document"),
  documentId: uuid,
  title: z.string().max(500),
});

export const annotationObjectSchema = objectBaseSchema.extend({
  type: z.literal("annotation"),
  points: z.array(finiteNumber).min(4).max(20_000),
  temporary: z.boolean().default(true),
  attachedObjectId: uuid.nullable(),
});

export const canvasObjectSchema = z.discriminatedUnion("type", [
  shapeObjectSchema,
  textObjectSchema,
  connectorObjectSchema,
  tableObjectSchema,
  documentObjectSchema,
  annotationObjectSchema,
]);

export type CanvasObject = z.infer<typeof canvasObjectSchema>;
