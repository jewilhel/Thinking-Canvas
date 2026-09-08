import type { CanvasObjectV2 } from "@/canvas/canvas-document";
import {
  maxCanvasScale,
  minCanvasScale,
  resolveConnectorPointsV2,
} from "@/canvas/geometry";
import {
  storyCameraSchema,
  storyTargetSchema,
  type StoryCamera,
  type StoryTarget,
} from "@/stories/story-model";

const REFERENCE_VIEWPORT = { width: 960, height: 640 };
const PADDING = 80;

export function framingForStoryObjects(
  objects: CanvasObjectV2[],
  targetObjectIds: string[],
): { camera: StoryCamera; target: StoryTarget } {
  const objectsById = new Map(objects.map((object) => [object.id, object]));
  const targets = targetObjectIds.map((id) => objectsById.get(id));
  if (!targets.length || targets.some((object) => !object)) {
    throw new Error("Scene framing referenced an unavailable canvas object.");
  }
  const bounds = targets.map((object) => {
    if (object!.type !== "connector") return object!.geometry;
    const points = resolveConnectorPointsV2(object!, objectsById);
    const x = Math.min(points[0]!, points[2]!);
    const y = Math.min(points[1]!, points[3]!);
    return {
      x,
      y,
      width: Math.max(1, Math.abs(points[2]! - points[0]!)),
      height: Math.max(1, Math.abs(points[3]! - points[1]!)),
    };
  });
  const left = Math.min(...bounds.map((item) => item.x)) - PADDING;
  const top = Math.min(...bounds.map((item) => item.y)) - PADDING;
  const right =
    Math.max(...bounds.map((item) => item.x + item.width)) + PADDING;
  const bottom =
    Math.max(...bounds.map((item) => item.y + item.height)) + PADDING;
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  const zoom = Math.min(
    maxCanvasScale,
    Math.max(
      minCanvasScale,
      Math.min(
        REFERENCE_VIEWPORT.width / width,
        REFERENCE_VIEWPORT.height / height,
      ),
    ),
  );
  return {
    camera: storyCameraSchema.parse({
      version: 1,
      center: { x: left + width / 2, y: top + height / 2 },
      zoom,
    }),
    target: storyTargetSchema.parse({
      version: 1,
      kind: "viewport",
      bounds: { x: left, y: top, width, height },
    }),
  };
}
