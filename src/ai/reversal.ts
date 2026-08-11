import { z } from "zod";

import { canvasObjectSchema, type CanvasObject } from "@/domain/canvas-object";

export const reversibleFieldSchema = z.enum([
  "text",
  "geometry.x",
  "geometry.y",
  "geometry.width",
  "geometry.height",
  "geometry.rotation",
]);

export type ReversibleField = z.infer<typeof reversibleFieldSchema>;

export type AiObjectChangeRecord = {
  objectId: string;
  before: CanvasObject;
  after: CanvasObject;
  affectedFields: ReversibleField[];
  explanation: string;
};

function fieldValue(object: CanvasObject, field: ReversibleField): unknown {
  if (field === "text") return "text" in object ? object.text : undefined;
  const geometryField = field.slice(
    "geometry.".length,
  ) as keyof CanvasObject["geometry"];
  return object.geometry[geometryField];
}

function restoreField(
  object: CanvasObject,
  before: CanvasObject,
  field: ReversibleField,
): CanvasObject {
  if (field === "text") {
    if (!("text" in object) || !("text" in before)) return object;
    return { ...object, text: before.text };
  }

  const geometryField = field.slice(
    "geometry.".length,
  ) as keyof CanvasObject["geometry"];
  return {
    ...object,
    geometry: {
      ...object.geometry,
      [geometryField]: before.geometry[geometryField],
    },
  };
}

export function reverseAiObjectChange(
  change: AiObjectChangeRecord,
  currentInput: unknown,
  reversedAt = new Date().toISOString(),
): {
  status: "reversed" | "partial" | "conflict";
  object: CanvasObject;
  restoredFields: ReversibleField[];
  conflictedFields: ReversibleField[];
} {
  const current = canvasObjectSchema.parse(currentInput);
  if (
    change.objectId !== current.id ||
    change.before.id !== current.id ||
    change.after.id !== current.id
  ) {
    throw new Error("AI reversal records must reference one object identity.");
  }

  let restored = current;
  const restoredFields: ReversibleField[] = [];
  const conflictedFields: ReversibleField[] = [];

  for (const field of change.affectedFields) {
    const parsedField = reversibleFieldSchema.parse(field);
    if (
      Object.is(
        fieldValue(current, parsedField),
        fieldValue(change.after, parsedField),
      )
    ) {
      restored = restoreField(restored, change.before, parsedField);
      restoredFields.push(parsedField);
    } else {
      conflictedFields.push(parsedField);
    }
  }

  if (restoredFields.length > 0)
    restored = { ...restored, updatedAt: reversedAt };
  const status =
    conflictedFields.length === 0
      ? "reversed"
      : restoredFields.length === 0
        ? "conflict"
        : "partial";

  return { status, object: restored, restoredFields, conflictedFields };
}
