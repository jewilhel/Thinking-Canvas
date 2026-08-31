import { z } from "zod";

import {
  canvasObjectV2Schema,
  type CanvasObjectV2,
} from "@/canvas/canvas-document";
import { resolveConnectorEndpointV2 } from "@/canvas/geometry";

export const canvasClipboardSchema = z.strictObject({
  schemaVersion: z.literal(1),
  sourceCanvasId: z.uuid(),
  objects: z.array(canvasObjectV2Schema).min(1).max(1_000),
});

export type CanvasClipboardPayload = z.infer<typeof canvasClipboardSchema>;

export function createCanvasClipboardPayload(
  allObjects: CanvasObjectV2[],
  selectedObjectIds: string[],
) {
  const selectedIds = new Set(selectedObjectIds);
  for (const object of allObjects) {
    if (
      object.type === "icon" &&
      object.parentId &&
      selectedIds.has(object.parentId)
    ) {
      selectedIds.add(object.id);
    }
  }
  const objectsById = new Map(allObjects.map((object) => [object.id, object]));
  const selected = allObjects.filter((object) => selectedIds.has(object.id));
  if (!selected.length) throw new Error("Select at least one object to copy.");

  const completeGroupIds = new Set(
    selected.flatMap((object) => {
      if (!object.groupId) return [];
      const allGroupMembers = allObjects.filter(
        (candidate) => candidate.groupId === object.groupId,
      );
      return allGroupMembers.every((member) => selectedIds.has(member.id))
        ? [object.groupId]
        : [];
    }),
  );

  const portable = selected.map((object): CanvasObjectV2 => {
    const groupId =
      object.groupId && completeGroupIds.has(object.groupId)
        ? object.groupId
        : null;
    if (object.type === "annotation") {
      return object.attachedObjectId &&
        !selectedIds.has(object.attachedObjectId)
        ? {
            ...object,
            groupId,
            attachedObjectId: null,
            attachmentOffset: null,
          }
        : { ...object, groupId };
    }
    if (object.type === "icon") {
      return object.parentId && !selectedIds.has(object.parentId)
        ? { ...object, groupId, parentId: null, parentRelative: null }
        : { ...object, groupId };
    }
    if (object.type !== "connector") return { ...object, groupId };

    function portableEndpoint(
      endpoint: Extract<CanvasObjectV2, { type: "connector" }>["start"],
    ) {
      if (endpoint.kind === "free" || selectedIds.has(endpoint.objectId)) {
        return endpoint;
      }
      return {
        kind: "free" as const,
        ...resolveConnectorEndpointV2(endpoint, objectsById),
      };
    }

    return {
      ...object,
      groupId,
      start: portableEndpoint(object.start),
      end: portableEndpoint(object.end),
    };
  });

  return canvasClipboardSchema.parse({
    schemaVersion: 1,
    sourceCanvasId: portable[0]!.canvasId,
    objects: portable,
  });
}

export function serializeCanvasClipboard(payload: CanvasClipboardPayload) {
  return JSON.stringify(canvasClipboardSchema.parse(payload));
}

export function parseCanvasClipboard(value: string) {
  return canvasClipboardSchema.parse(JSON.parse(value) as unknown);
}

export function remapCanvasClipboard(
  input: unknown,
  options: {
    canvasId: string;
    actorId: string;
    issuedAt: string;
    offset?: number;
  },
) {
  const payload = canvasClipboardSchema.parse(input);
  const objectIds = new Map(
    payload.objects.map((object) => [object.id, crypto.randomUUID()]),
  );
  const groupIds = new Map<string, string>();
  for (const object of payload.objects) {
    if (object.groupId && !groupIds.has(object.groupId)) {
      groupIds.set(object.groupId, crypto.randomUUID());
    }
  }
  const offset = options.offset ?? 32;

  return payload.objects.map((object): CanvasObjectV2 => {
    const shared = {
      ...object,
      id: objectIds.get(object.id)!,
      canvasId: options.canvasId,
      createdBy: options.actorId,
      createdAt: options.issuedAt,
      updatedAt: options.issuedAt,
      groupId: object.groupId ? groupIds.get(object.groupId)! : null,
      geometry: {
        ...object.geometry,
        x: object.geometry.x + offset,
        y: object.geometry.y + offset,
      },
    };
    if (object.type === "annotation") {
      const attachedObjectId = object.attachedObjectId
        ? objectIds.get(object.attachedObjectId)
        : null;
      if (object.attachedObjectId && !attachedObjectId) {
        throw new Error("Clipboard annotation references an external object.");
      }
      return canvasObjectV2Schema.parse({
        ...shared,
        attachedObjectId,
      });
    }
    if (object.type === "icon") {
      const parentId = object.parentId ? objectIds.get(object.parentId) : null;
      if (object.parentId && !parentId) {
        throw new Error("Clipboard icon references an external parent.");
      }
      return canvasObjectV2Schema.parse({ ...shared, parentId });
    }
    if (object.type !== "connector") {
      return canvasObjectV2Schema.parse(shared);
    }

    function remapEndpoint(
      endpoint: Extract<CanvasObjectV2, { type: "connector" }>["start"],
    ) {
      if (endpoint.kind === "free") {
        return {
          kind: "free" as const,
          x: endpoint.x + offset,
          y: endpoint.y + offset,
        };
      }
      const remappedId = objectIds.get(endpoint.objectId);
      if (!remappedId) {
        throw new Error("Clipboard connector references an external object.");
      }
      return { ...endpoint, objectId: remappedId };
    }

    return canvasObjectV2Schema.parse({
      ...shared,
      start: remapEndpoint(object.start),
      end: remapEndpoint(object.end),
    });
  });
}
