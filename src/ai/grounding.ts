import { z } from "zod";

import {
  canvasObjectV2Schema,
  isIntrinsicShapeLabel,
  projectCanvasCompositions,
  type CanvasObjectV2,
} from "@/canvas/canvas-document";
import {
  aiObjectVisualFactsSchema,
  buildObjectVisualFacts,
} from "@/ai/visual-grounding";

const uuid = z.uuid();
const pageRequestSchema = z.strictObject({
  cursor: z.number().int().nonnegative().default(0),
  limit: z.number().int().min(1).max(100).default(25),
});

export const canvasObjectDetailSchema = z.strictObject({
  id: uuid,
  canvasId: uuid,
  type: z.string().min(1).max(80),
  summary: z.string().max(10_000),
  geometry: z.strictObject({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().nonnegative(),
    height: z.number().finite().nonnegative(),
    rotation: z.number().finite(),
  }),
  groupId: uuid.nullable(),
  orderIndex: z.number().int().nonnegative(),
  relationshipIds: z.array(uuid).max(1_000),
  state: canvasObjectV2Schema,
  visual: aiObjectVisualFactsSchema,
});

export const commentThreadDetailSchema = z.strictObject({
  id: uuid,
  status: z.enum(["open", "resolved"]),
  body: z.string().max(100_000),
  authorKind: z.enum(["human", "ai"]),
  authorKey: z.string().min(1).max(255),
  targetObjectIds: z.array(uuid).max(100),
  documentRange: z
    .strictObject({
      documentObjectId: uuid,
      quote: z.string().min(1).max(1_000),
      detached: z.boolean(),
    })
    .nullable()
    .default(null),
  participantKeys: z.array(z.string().min(1).max(255)).max(100),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  replies: z
    .array(
      z.strictObject({
        id: uuid,
        authorKind: z.enum(["human", "ai"]),
        authorKey: z.string().min(1).max(255),
        body: z.string().max(100_000),
        createdAt: z.iso.datetime({ offset: true }),
        updatedAt: z.iso.datetime({ offset: true }),
      }),
    )
    .max(10_000),
  prompt: z
    .strictObject({
      kind: z.enum(["yes_no", "review", "rating"]),
      responses: z.array(z.unknown()).max(10_000),
    })
    .nullable(),
});

const inspectCanvasObjectsSchema = z.strictObject({
  tool: z.literal("inspect_canvas_objects"),
  objectIds: z.array(uuid).max(100).optional(),
  cursor: z.number().int().nonnegative().default(0),
  limit: z.number().int().min(1).max(100).default(25),
});

const inspectCommentThreadsSchema = z.strictObject({
  tool: z.literal("inspect_comment_threads"),
  threadIds: z.array(uuid).max(100).optional(),
  cursor: z.number().int().nonnegative().default(0),
  limit: z.number().int().min(1).max(100).default(25),
});

export const readOnlyGroundingToolSchema = z.discriminatedUnion("tool", [
  inspectCanvasObjectsSchema,
  inspectCommentThreadsSchema,
]);

function summarizeObject(object: CanvasObjectV2) {
  if (object.type === "shape")
    return `${object.shape}: ${object.text}`.slice(0, 10_000);
  if (object.type === "text") return object.text.slice(0, 10_000);
  if (object.type === "table")
    return object.cells.flat().join(" | ").slice(0, 10_000);
  if (object.type === "document") return object.title.slice(0, 10_000);
  if (object.type === "connector") return "Connector";
  if (object.type === "icon") return `Phosphor icon: ${object.iconName}`;
  return `${object.temporary ? "Temporary" : "Promoted"} ${object.ink === "highlighter" ? "highlighter" : "pen"} annotation · ${object.style.outline} · ${object.style.outlineWidth}px${object.attachedObjectId ? " · attached" : ""}`;
}

function compactProjectionState(object: CanvasObjectV2): CanvasObjectV2 {
  if (object.type !== "annotation" || object.points.length <= 64) return object;
  const sampleCount = object.points.length / 2;
  const selectedIndexes = Array.from({ length: 32 }, (_, index) =>
    Math.round((index * (sampleCount - 1)) / 31),
  );
  return {
    ...object,
    points: selectedIndexes.flatMap((index) => [
      object.points[index * 2]!,
      object.points[index * 2 + 1]!,
    ]),
    pressures: object.pressures
      ? selectedIndexes.map((index) => object.pressures![index]!)
      : undefined,
  };
}

export function buildCanvasObjectDetails(
  canvasId: string,
  objects: CanvasObjectV2[],
) {
  const compositionTargetById = new Map(
    objects.flatMap((object) =>
      isIntrinsicShapeLabel(object) && object.parentId
        ? [[object.id, object.parentId] as const]
        : [],
    ),
  );
  objects = projectCanvasCompositions(objects);
  const adjacency = new Map<string, Set<string>>();
  for (const object of objects) adjacency.set(object.id, new Set());
  for (const connector of objects) {
    if (connector.type !== "connector") continue;
    const endpoints = [connector.start, connector.end].flatMap((endpoint) =>
      endpoint.kind === "attached"
        ? [compositionTargetById.get(endpoint.objectId) ?? endpoint.objectId]
        : [],
    );
    for (const endpointId of endpoints) {
      adjacency.get(connector.id)?.add(endpointId);
      adjacency.get(endpointId)?.add(connector.id);
    }
    if (endpoints.length === 2) {
      adjacency.get(endpoints[0]!)?.add(endpoints[1]!);
      adjacency.get(endpoints[1]!)?.add(endpoints[0]!);
    }
  }
  for (const annotation of objects) {
    if (annotation.type !== "annotation" || !annotation.attachedObjectId)
      continue;
    adjacency.get(annotation.id)?.add(annotation.attachedObjectId);
    adjacency.get(annotation.attachedObjectId)?.add(annotation.id);
  }
  for (const icon of objects) {
    if (icon.type !== "icon" || !icon.parentId) continue;
    adjacency.get(icon.id)?.add(icon.parentId);
    adjacency.get(icon.parentId)?.add(icon.id);
  }
  return objects.map((object, orderIndex) =>
    canvasObjectDetailSchema.parse({
      id: object.id,
      canvasId: object.canvasId,
      type: object.type,
      summary: summarizeObject(object),
      geometry: object.geometry,
      groupId: object.groupId ?? null,
      orderIndex,
      relationshipIds: [...(adjacency.get(object.id) ?? [])].sort(),
      state: compactProjectionState(object),
      visual: buildObjectVisualFacts(object, objects),
    }),
  );
}

function page<T>(items: T[], input: unknown) {
  const request = pageRequestSchema.parse(input);
  const selected = items.slice(request.cursor, request.cursor + request.limit);
  const nextCursor =
    request.cursor + selected.length < items.length
      ? request.cursor + selected.length
      : null;
  return { items: selected, nextCursor, total: items.length };
}

export function inspectCanvasObjects(
  details: z.infer<typeof canvasObjectDetailSchema>[],
  input: unknown,
) {
  const request = inspectCanvasObjectsSchema.parse(input);
  const allowed = request.objectIds ? new Set(request.objectIds) : null;
  const selected = allowed
    ? details.filter((detail) => allowed.has(detail.id))
    : details;
  return page(selected, { cursor: request.cursor, limit: request.limit });
}

export function inspectCommentThreads(
  details: z.infer<typeof commentThreadDetailSchema>[],
  input: unknown,
) {
  const request = inspectCommentThreadsSchema.parse(input);
  const allowed = request.threadIds ? new Set(request.threadIds) : null;
  const selected = allowed
    ? details.filter((detail) => allowed.has(detail.id))
    : details;
  return page(selected, { cursor: request.cursor, limit: request.limit });
}

export type ConnectedPathErrorCode =
  "stale_object" | "cross_canvas_object" | "not_connected" | "ambiguous_path";

export class ConnectedPathError extends Error {
  constructor(
    readonly code: ConnectedPathErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ConnectedPathError";
  }
}

export function validateConnectedPath(input: {
  canvasId: string;
  objects: CanvasObjectV2[];
  orderedObjectIds: string[];
}) {
  const objectsById = new Map(
    input.objects.map((object) => [object.id, object]),
  );
  const compositionObjectId = (objectId: string) => {
    const object = objectsById.get(objectId);
    return object && isIntrinsicShapeLabel(object) && object.parentId
      ? object.parentId
      : objectId;
  };
  const seen = new Set<string>();
  for (const objectId of input.orderedObjectIds) {
    if (seen.has(objectId)) {
      throw new ConnectedPathError(
        "ambiguous_path",
        "A connected path cannot contain the same object more than once.",
      );
    }
    seen.add(objectId);
    const object = objectsById.get(objectId);
    if (!object) {
      throw new ConnectedPathError(
        "stale_object",
        "A selected path object is no longer available.",
      );
    }
    if (object.canvasId !== input.canvasId) {
      throw new ConnectedPathError(
        "cross_canvas_object",
        "A selected path object belongs to another canvas.",
      );
    }
  }

  for (let index = 1; index < input.orderedObjectIds.length; index += 1) {
    const previousId = input.orderedObjectIds[index - 1]!;
    const currentId = input.orderedObjectIds[index]!;
    const connectors = input.objects.filter((object) => {
      if (object.type !== "connector") return false;
      const endpoints = [object.start, object.end].flatMap((endpoint) =>
        endpoint.kind === "attached"
          ? [compositionObjectId(endpoint.objectId)]
          : [],
      );
      return endpoints.includes(previousId) && endpoints.includes(currentId);
    });
    if (!connectors.length) {
      throw new ConnectedPathError(
        "not_connected",
        "Consecutive selected path objects are not durably connected.",
      );
    }
    if (connectors.length > 1) {
      throw new ConnectedPathError(
        "ambiguous_path",
        "Consecutive selected path objects have more than one durable connection.",
      );
    }
  }
  return [...input.orderedObjectIds];
}

export const READ_ONLY_GROUNDING_TOOLS = {
  inspect_canvas_objects: inspectCanvasObjectsSchema,
  inspect_comment_threads: inspectCommentThreadsSchema,
} as const;
