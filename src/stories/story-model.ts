import { z } from "zod";

import {
  maxCanvasScale,
  minCanvasScale,
  type Viewport,
} from "@/canvas/geometry";

const finiteNumber = z.number().finite();

export const storyCameraSchema = z.strictObject({
  version: z.literal(1),
  center: z.strictObject({ x: finiteNumber, y: finiteNumber }),
  zoom: finiteNumber.min(minCanvasScale).max(maxCanvasScale),
});

export const storyTargetSchema = z.strictObject({
  version: z.literal(1),
  kind: z.literal("viewport"),
  bounds: z.strictObject({
    x: finiteNumber,
    y: finiteNumber,
    width: finiteNumber.positive(),
    height: finiteNumber.positive(),
  }),
});

export const storySceneSchema = z.strictObject({
  id: z.uuid(),
  title: z.string().trim().min(1).max(120),
  position: z.number().int().nonnegative(),
  camera: storyCameraSchema,
  target: storyTargetSchema,
  narration: z.string().max(100_000).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const primaryStorySchema = z.strictObject({
  id: z.uuid(),
  revision: z.number().int().nonnegative(),
  title: z.string().min(1).max(500),
  scenes: z.array(storySceneSchema),
});

export const storyResponseSchema = z.strictObject({
  story: primaryStorySchema.nullable(),
});

export const captureSceneRequestSchema = z.strictObject({
  title: z.string().trim().min(1).max(120),
  expectedRevision: z.number().int().nonnegative().nullable(),
  camera: storyCameraSchema,
  target: storyTargetSchema,
});

const sceneMutationBase = {
  sceneId: z.uuid(),
  expectedRevision: z.number().int().nonnegative(),
};

export const storyMutationRequestSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("rename"),
    ...sceneMutationBase,
    title: z.string().trim().min(1).max(120),
  }),
  z.strictObject({
    action: z.literal("replace"),
    ...sceneMutationBase,
    camera: storyCameraSchema,
    target: storyTargetSchema,
  }),
  z.strictObject({
    action: z.literal("reorder"),
    expectedRevision: z.number().int().nonnegative(),
    sceneIds: z.array(z.uuid()).min(1).max(500),
  }),
  z.strictObject({ action: z.literal("restore"), ...sceneMutationBase }),
]);

export const storyDeleteRequestSchema = z.strictObject(sceneMutationBase);

export type StoryCamera = z.infer<typeof storyCameraSchema>;
export type StoryTarget = z.infer<typeof storyTargetSchema>;
export type StoryScene = z.infer<typeof storySceneSchema>;
export type PrimaryStory = z.infer<typeof primaryStorySchema>;

export type CanvasViewportSize = { width: number; height: number };

function requireViewportSize(size: CanvasViewportSize) {
  if (
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width <= 0 ||
    size.height <= 0
  ) {
    throw new Error("A positive canvas viewport size is required.");
  }
}

export function captureStoryFraming(
  viewport: Viewport,
  size: CanvasViewportSize,
): { camera: StoryCamera; target: StoryTarget } {
  requireViewportSize(size);
  const camera = storyCameraSchema.parse({
    version: 1,
    center: {
      x: (size.width / 2 - viewport.x) / viewport.scale,
      y: (size.height / 2 - viewport.y) / viewport.scale,
    },
    zoom: viewport.scale,
  });
  const worldWidth = size.width / viewport.scale;
  const worldHeight = size.height / viewport.scale;
  return {
    camera,
    target: storyTargetSchema.parse({
      version: 1,
      kind: "viewport",
      bounds: {
        x: camera.center.x - worldWidth / 2,
        y: camera.center.y - worldHeight / 2,
        width: worldWidth,
        height: worldHeight,
      },
    }),
  };
}

export function viewportForStoryCamera(
  camera: StoryCamera,
  size: CanvasViewportSize,
): Viewport {
  requireViewportSize(size);
  const parsed = storyCameraSchema.parse(camera);
  return {
    scale: parsed.zoom,
    x: size.width / 2 - parsed.center.x * parsed.zoom,
    y: size.height / 2 - parsed.center.y * parsed.zoom,
  };
}
