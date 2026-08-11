import { z } from "zod";
import * as Y from "yjs";

const internalObjectsMapName = "document-internal-objects";

export const documentInternalObjectSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: z.uuid(),
  documentId: z.uuid(),
  type: z.enum(["shape", "text"]),
  text: z.string().max(10_000),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
});

export type DocumentInternalObject = z.infer<
  typeof documentInternalObjectSchema
>;

function internalObjects(document: Y.Doc) {
  return document.getMap<unknown>(internalObjectsMapName);
}

export function putDocumentInternalObject(
  document: Y.Doc,
  object: DocumentInternalObject,
) {
  const validated = documentInternalObjectSchema.parse(object);
  internalObjects(document).set(validated.id, validated);
}

export function listDocumentInternalObjects(
  document: Y.Doc,
): DocumentInternalObject[] {
  return [...internalObjects(document).values()]
    .map((value) => documentInternalObjectSchema.parse(value))
    .sort((left, right) => left.id.localeCompare(right.id));
}
