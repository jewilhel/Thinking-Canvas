import { z } from "zod";

import { canvasObjectSchema, type CanvasObject } from "@/domain/canvas-object";

export const AI_PROJECTION_MAX_OBJECTS = 200;
export const AI_PROJECTION_MAX_BYTES = 64 * 1024;
export const AI_INSTRUCTION_MAX_LENGTH = 2_000;
const CONTENT_SUMMARY_MAX_LENGTH = 500;

const projectionRequestSchema = z.strictObject({
  canvasId: z.uuid(),
  objects: z.array(canvasObjectSchema).max(AI_PROJECTION_MAX_OBJECTS),
});

export type AiCanvasProjection = {
  schemaVersion: 1;
  canvasId: string;
  objects: Array<{
    id: string;
    type: CanvasObject["type"];
    geometry: CanvasObject["geometry"];
    content: string;
    relationships: string[];
  }>;
};

export class ProjectionLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectionLimitError";
  }
}

function summarizeContent(object: CanvasObject) {
  let content = "";

  switch (object.type) {
    case "shape":
      content = `${object.shape}: ${object.text}`;
      break;
    case "text":
      content = object.text;
      break;
    case "table":
      content = object.cells.flat().join(" | ");
      break;
    case "document":
      content = object.title;
      break;
    case "connector":
      content = "connector";
      break;
    case "annotation":
      content = "temporary annotation";
      break;
  }

  return content.slice(0, CONTENT_SUMMARY_MAX_LENGTH);
}

function relationshipsFor(object: CanvasObject) {
  if (object.type === "connector") {
    return [object.startObjectId, object.endObjectId].filter(
      (id): id is string => id !== null,
    );
  }

  if (object.type === "annotation" && object.attachedObjectId) {
    return [object.attachedObjectId];
  }

  return [];
}

export function buildAiCanvasProjection(input: unknown): AiCanvasProjection {
  const parsed = projectionRequestSchema.safeParse(input);

  if (!parsed.success) {
    const objectLimitIssue = parsed.error.issues.some(
      (issue) => issue.path[0] === "objects" && issue.code === "too_big",
    );
    if (objectLimitIssue) {
      throw new ProjectionLimitError(
        `AI projections are limited to ${AI_PROJECTION_MAX_OBJECTS} objects.`,
      );
    }
    throw parsed.error;
  }

  const projection: AiCanvasProjection = {
    schemaVersion: 1,
    canvasId: parsed.data.canvasId,
    objects: parsed.data.objects.map((object) => ({
      id: object.id,
      type: object.type,
      geometry: object.geometry,
      content: summarizeContent(object),
      relationships: relationshipsFor(object),
    })),
  };

  const byteLength = new TextEncoder().encode(
    JSON.stringify(projection),
  ).length;
  if (byteLength > AI_PROJECTION_MAX_BYTES) {
    throw new ProjectionLimitError(
      `AI projections are limited to ${AI_PROJECTION_MAX_BYTES} bytes.`,
    );
  }

  return projection;
}
