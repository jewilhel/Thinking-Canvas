import { z } from "zod";

import {
  AI_CANVAS_DESIGN_TOKENS,
  estimateTextLayout,
} from "@/ai/visual-grounding";
import type { CanvasObjectV2 } from "@/canvas/canvas-document";
import type { ProductCanvasMutation } from "@/domain/canvas-command";

const uuid = z.uuid();
const uniqueIds = z
  .array(uuid)
  .min(1)
  .max(100)
  .superRefine((ids, context) => {
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        message: "Layout object IDs must be unique.",
      });
    }
  });

export const deterministicLayoutRequestSchema = z.discriminatedUnion(
  "operation",
  [
    z.strictObject({
      operation: z.literal("align"),
      objectIds: uniqueIds.min(2),
      alignment: z.enum(["left", "center", "right", "top", "middle", "bottom"]),
    }),
    z.strictObject({
      operation: z.literal("distribute"),
      objectIds: uniqueIds.min(3),
      axis: z.enum(["horizontal", "vertical"]),
    }),
    z.strictObject({
      operation: z.literal("normalize_spacing"),
      objectIds: uniqueIds.min(2),
      axis: z.enum(["horizontal", "vertical"]),
      spacing: z.number().finite().min(0).max(2_000).optional(),
    }),
    z.strictObject({
      operation: z.literal("align_and_space"),
      objectIds: uniqueIds.min(2),
      axis: z.enum(["horizontal", "vertical"]),
      spacing: z.number().finite().min(0).max(2_000).optional(),
    }),
    z.strictObject({
      operation: z.literal("resize_to_content"),
      objectIds: uniqueIds,
    }),
  ],
);

export type DeterministicLayoutRequest = z.infer<
  typeof deterministicLayoutRequestSchema
>;

export class DeterministicLayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeterministicLayoutError";
  }
}

function requireObjects(objects: CanvasObjectV2[], objectIds: string[]) {
  const byId = new Map(objects.map((object) => [object.id, object]));
  return objectIds.map((id) => {
    const object = byId.get(id);
    if (!object)
      throw new DeterministicLayoutError(
        "A requested layout object is not available.",
      );
    if (object.type === "connector" || object.type === "annotation") {
      throw new DeterministicLayoutError(
        "Connectors and annotations cannot be direct layout targets.",
      );
    }
    return object;
  });
}

function moveCommand(object: CanvasObjectV2, x: number, y: number) {
  if (object.geometry.x === x && object.geometry.y === y) return [];
  return [
    {
      type: "object.move" as const,
      payload: { objectId: object.id, x, y },
    },
  ];
}

function align(objects: CanvasObjectV2[], alignment: string) {
  const target =
    alignment === "left"
      ? Math.min(...objects.map((object) => object.geometry.x))
      : alignment === "right"
        ? Math.max(
            ...objects.map(
              (object) => object.geometry.x + object.geometry.width,
            ),
          )
        : alignment === "center"
          ? objects.reduce(
              (total, object) =>
                total + object.geometry.x + object.geometry.width / 2,
              0,
            ) / objects.length
          : alignment === "top"
            ? Math.min(...objects.map((object) => object.geometry.y))
            : alignment === "bottom"
              ? Math.max(
                  ...objects.map(
                    (object) => object.geometry.y + object.geometry.height,
                  ),
                )
              : objects.reduce(
                  (total, object) =>
                    total + object.geometry.y + object.geometry.height / 2,
                  0,
                ) / objects.length;
  return objects.flatMap((object) => {
    const x =
      alignment === "left"
        ? target
        : alignment === "right"
          ? target - object.geometry.width
          : alignment === "center"
            ? target - object.geometry.width / 2
            : object.geometry.x;
    const y =
      alignment === "top"
        ? target
        : alignment === "bottom"
          ? target - object.geometry.height
          : alignment === "middle"
            ? target - object.geometry.height / 2
            : object.geometry.y;
    return moveCommand(object, x, y);
  });
}

function distribute(
  objects: CanvasObjectV2[],
  axis: "horizontal" | "vertical",
) {
  const position = (object: CanvasObjectV2) =>
    axis === "horizontal" ? object.geometry.x : object.geometry.y;
  const size = (object: CanvasObjectV2) =>
    axis === "horizontal" ? object.geometry.width : object.geometry.height;
  const ordered = [...objects].sort(
    (left, right) =>
      position(left) - position(right) || left.id.localeCompare(right.id),
  );
  const first = ordered[0]!;
  const last = ordered.at(-1)!;
  const interiorSize = ordered
    .slice(1, -1)
    .reduce((sum, object) => sum + size(object), 0);
  const gap =
    (position(last) +
      size(last) -
      position(first) -
      size(first) -
      interiorSize) /
    (ordered.length - 1);
  let cursor = position(first) + size(first) + gap;
  return ordered.slice(1, -1).flatMap((object) => {
    const commands = moveCommand(
      object,
      axis === "horizontal" ? cursor : object.geometry.x,
      axis === "vertical" ? cursor : object.geometry.y,
    );
    cursor += size(object) + gap;
    return commands;
  });
}

function normalizeSpacing(
  objects: CanvasObjectV2[],
  axis: "horizontal" | "vertical",
  spacing: number,
) {
  const position = (object: CanvasObjectV2) =>
    axis === "horizontal" ? object.geometry.x : object.geometry.y;
  const size = (object: CanvasObjectV2) =>
    axis === "horizontal" ? object.geometry.width : object.geometry.height;
  const ordered = [...objects].sort(
    (left, right) =>
      position(left) - position(right) || left.id.localeCompare(right.id),
  );
  let cursor = position(ordered[0]!);
  return ordered.flatMap((object, index) => {
    const commands = index
      ? moveCommand(
          object,
          axis === "horizontal" ? cursor : object.geometry.x,
          axis === "vertical" ? cursor : object.geometry.y,
        )
      : [];
    cursor += size(object) + spacing;
    return commands;
  });
}

function alignAndSpace(
  objects: CanvasObjectV2[],
  axis: "horizontal" | "vertical",
  spacing: number,
) {
  const primaryPosition = (object: CanvasObjectV2) =>
    axis === "horizontal" ? object.geometry.x : object.geometry.y;
  const primarySize = (object: CanvasObjectV2) =>
    axis === "horizontal" ? object.geometry.width : object.geometry.height;
  const crossCenter =
    objects.reduce(
      (sum, object) =>
        sum +
        (axis === "horizontal"
          ? object.geometry.y + object.geometry.height / 2
          : object.geometry.x + object.geometry.width / 2),
      0,
    ) / objects.length;
  const ordered = [...objects].sort(
    (left, right) =>
      primaryPosition(left) - primaryPosition(right) ||
      left.id.localeCompare(right.id),
  );
  let cursor = primaryPosition(ordered[0]!);

  return ordered.flatMap((object) => {
    const x =
      axis === "horizontal" ? cursor : crossCenter - object.geometry.width / 2;
    const y =
      axis === "vertical" ? cursor : crossCenter - object.geometry.height / 2;
    const commands = moveCommand(object, x, y);
    cursor += primarySize(object) + spacing;
    return commands;
  });
}

function contentText(object: CanvasObjectV2) {
  if (object.type === "shape" || object.type === "text") return object.text;
  if (object.type === "table")
    return object.cells.map((row) => row.join(" | ")).join("\n");
  if (object.type === "document") return object.title;
  return "";
}

function resizeToContent(objects: CanvasObjectV2[]) {
  return objects.flatMap((object) => {
    const text = contentText(object);
    const layout = estimateTextLayout(object);
    const fontSize = object.style.fontSize;
    const longestLine = Math.max(
      1,
      ...text.split("\n").map((line) => line.length),
    );
    const width = Math.max(
      AI_CANVAS_DESIGN_TOKENS.minimumObjectSize,
      Math.min(
        720,
        Math.ceil(
          longestLine * fontSize * 0.58 +
            AI_CANVAS_DESIGN_TOKENS.textHorizontalPadding * 2,
        ),
      ),
    );
    const height = Math.max(
      AI_CANVAS_DESIGN_TOKENS.minimumObjectSize,
      Math.ceil(
        layout.estimatedTextLines *
          fontSize *
          AI_CANVAS_DESIGN_TOKENS.estimatedLineHeightRatio +
          AI_CANVAS_DESIGN_TOKENS.textVerticalPadding * 2,
      ),
    );
    if (object.geometry.width === width && object.geometry.height === height)
      return [];
    return [
      {
        type: "object.resize" as const,
        payload: { objectId: object.id, width, height },
      },
    ];
  });
}

export function planDeterministicLayout(input: {
  objects: CanvasObjectV2[];
  request: unknown;
}): ProductCanvasMutation[] {
  const request = deterministicLayoutRequestSchema.parse(input.request);
  const targets = requireObjects(input.objects, request.objectIds);
  const commands =
    request.operation === "align"
      ? align(targets, request.alignment)
      : request.operation === "distribute"
        ? distribute(targets, request.axis)
        : request.operation === "normalize_spacing"
          ? normalizeSpacing(
              targets,
              request.axis,
              request.spacing ?? AI_CANVAS_DESIGN_TOKENS.preferredSpacing,
            )
          : request.operation === "align_and_space"
            ? alignAndSpace(
                targets,
                request.axis,
                request.spacing ?? AI_CANVAS_DESIGN_TOKENS.preferredSpacing,
              )
            : resizeToContent(targets);
  if (!commands.length) {
    throw new DeterministicLayoutError(
      "The requested layout already matches the deterministic result.",
    );
  }
  return commands;
}
