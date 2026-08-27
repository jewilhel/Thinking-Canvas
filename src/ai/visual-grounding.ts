import { z } from "zod";

import {
  canvasObjectV2Schema,
  type CanvasObjectV2,
} from "@/canvas/canvas-document";

const finiteNumber = z.number().finite();

export const AI_CANVAS_DESIGN_TOKENS = {
  minimumObjectSize: 24,
  minimumSpacing: 16,
  preferredSpacing: 24,
  textHorizontalPadding: 16,
  textVerticalPadding: 12,
  estimatedLineHeightRatio: 1.25,
  minimumContrastRatio: 4.5,
} as const;

export const aiCanvasDesignTokensSchema = z.strictObject({
  minimumObjectSize: finiteNumber.positive(),
  minimumSpacing: finiteNumber.nonnegative(),
  preferredSpacing: finiteNumber.nonnegative(),
  textHorizontalPadding: finiteNumber.nonnegative(),
  textVerticalPadding: finiteNumber.nonnegative(),
  estimatedLineHeightRatio: finiteNumber.positive(),
  minimumContrastRatio: finiteNumber.positive(),
});

export const aiObjectVisualFactsSchema = z.strictObject({
  rotatedBounds: z.strictObject({
    x: finiteNumber,
    y: finiteNumber,
    width: finiteNumber.nonnegative(),
    height: finiteNumber.nonnegative(),
  }),
  estimatedTextLines: z.number().int().nonnegative(),
  estimatedTextClipped: z.boolean(),
  overlappingObjectIds: z.array(z.uuid()).max(10_000),
});

export class AiVisualQualityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiVisualQualityError";
  }
}

export const aiProjectionObjectStateSchema = canvasObjectV2Schema;

function textForObject(object: CanvasObjectV2) {
  if (object.type === "shape" || object.type === "text") return object.text;
  if (object.type === "table")
    return object.cells.map((row) => row.join(" | ")).join("\n");
  if (object.type === "document") return object.title;
  return "";
}

export function rotatedObjectBounds(object: CanvasObjectV2) {
  const { x, y, width, height, rotation } = object.geometry;
  if (rotation === 0) return { x, y, width, height };
  const radians = (rotation * Math.PI) / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));
  const rotatedWidth = width * cosine + height * sine;
  const rotatedHeight = width * sine + height * cosine;
  return {
    x: x + (width - rotatedWidth) / 2,
    y: y + (height - rotatedHeight) / 2,
    width: rotatedWidth,
    height: rotatedHeight,
  };
}

function intersects(
  left: ReturnType<typeof rotatedObjectBounds>,
  right: ReturnType<typeof rotatedObjectBounds>,
) {
  return !(
    left.x + left.width <= right.x ||
    right.x + right.width <= left.x ||
    left.y + left.height <= right.y ||
    right.y + right.height <= left.y
  );
}

export function estimateTextLayout(object: CanvasObjectV2) {
  const text = textForObject(object);
  if (!text) return { estimatedTextLines: 0, estimatedTextClipped: false };
  const fontSize = object.style.fontSize;
  const usableWidth = Math.max(
    fontSize,
    object.geometry.width - AI_CANVAS_DESIGN_TOKENS.textHorizontalPadding * 2,
  );
  const approximateCharactersPerLine = Math.max(
    1,
    Math.floor(usableWidth / (fontSize * 0.58)),
  );
  const estimatedTextLines = text
    .split("\n")
    .reduce(
      (total, line) =>
        total +
        Math.max(1, Math.ceil(line.length / approximateCharactersPerLine)),
      0,
    );
  const requiredHeight =
    estimatedTextLines *
      fontSize *
      AI_CANVAS_DESIGN_TOKENS.estimatedLineHeightRatio +
    AI_CANVAS_DESIGN_TOKENS.textVerticalPadding * 2;
  return {
    estimatedTextLines,
    estimatedTextClipped: requiredHeight > object.geometry.height,
  };
}

export function buildObjectVisualFacts(
  object: CanvasObjectV2,
  objects: CanvasObjectV2[],
) {
  const rotatedBounds = rotatedObjectBounds(object);
  const textLayout = estimateTextLayout(object);
  const overlappingObjectIds = objects
    .filter(
      (candidate) =>
        candidate.id !== object.id &&
        object.type !== "connector" &&
        candidate.type !== "connector" &&
        intersects(rotatedBounds, rotatedObjectBounds(candidate)),
    )
    .map((candidate) => candidate.id)
    .sort();
  return aiObjectVisualFactsSchema.parse({
    rotatedBounds,
    ...textLayout,
    overlappingObjectIds,
  });
}

function luminance(hex: string) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return null;
  const channels = [1, 3, 5].map(
    (index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255,
  );
  const linear = channels.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4),
  );
  return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
}

function contrastRatio(foreground: string, background: string) {
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  if (foregroundLuminance === null || backgroundLuminance === null) return null;
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

export function deterministicVisualIssueKeys(input: {
  objects: CanvasObjectV2[];
  targetObjectIds: string[];
}) {
  const ids = new Set(input.objects.map((object) => object.id));
  const targets = input.objects.filter((object) =>
    input.targetObjectIds.includes(object.id),
  );
  const issues = new Set<string>();
  for (const object of targets) {
    const facts = buildObjectVisualFacts(object, input.objects);
    if (
      object.geometry.width < AI_CANVAS_DESIGN_TOKENS.minimumObjectSize ||
      object.geometry.height < AI_CANVAS_DESIGN_TOKENS.minimumObjectSize
    ) {
      issues.add(`${object.id}:minimum_bounds`);
    }
    if (facts.estimatedTextClipped) issues.add(`${object.id}:text_clipped`);
    for (const overlapId of facts.overlappingObjectIds) {
      issues.add(`${object.id}:overlap:${overlapId}`);
    }
    const objectBounds = rotatedObjectBounds(object);
    for (const candidate of input.objects) {
      if (
        candidate.id === object.id ||
        candidate.type === "connector" ||
        object.type === "connector"
      ) {
        continue;
      }
      const candidateBounds = rotatedObjectBounds(candidate);
      const horizontalGap = Math.max(
        candidateBounds.x - (objectBounds.x + objectBounds.width),
        objectBounds.x - (candidateBounds.x + candidateBounds.width),
      );
      const verticalGap = Math.max(
        candidateBounds.y - (objectBounds.y + objectBounds.height),
        objectBounds.y - (candidateBounds.y + candidateBounds.height),
      );
      const verticallyAligned = verticalGap < 0;
      const horizontallyAligned = horizontalGap < 0;
      if (
        (verticallyAligned &&
          horizontalGap >= 0 &&
          horizontalGap < AI_CANVAS_DESIGN_TOKENS.minimumSpacing) ||
        (horizontallyAligned &&
          verticalGap >= 0 &&
          verticalGap < AI_CANVAS_DESIGN_TOKENS.minimumSpacing)
      ) {
        issues.add(`${object.id}:spacing:${candidate.id}`);
      }
    }
    const fill = object.style.fill;
    const textColor = object.style.textColor;
    if (fill && textColor) {
      const ratio = contrastRatio(textColor, fill);
      if (
        ratio !== null &&
        ratio < AI_CANVAS_DESIGN_TOKENS.minimumContrastRatio
      ) {
        issues.add(`${object.id}:text_contrast`);
      }
    }
    if (object.type === "connector") {
      for (const [endpoint, value] of [
        ["start", object.start],
        ["end", object.end],
      ] as const) {
        if (value.kind === "attached" && !ids.has(value.objectId)) {
          issues.add(`${object.id}:${endpoint}_target_missing`);
        }
      }
    }
  }
  return [...issues].sort();
}

export function assertNoNewDeterministicVisualDefects(input: {
  beforeObjects: CanvasObjectV2[];
  afterObjects: CanvasObjectV2[];
  targetObjectIds: string[];
}) {
  const before = new Set(
    deterministicVisualIssueKeys({
      objects: input.beforeObjects,
      targetObjectIds: input.targetObjectIds,
    }),
  );
  const introduced = deterministicVisualIssueKeys({
    objects: input.afterObjects,
    targetObjectIds: input.targetObjectIds,
  }).filter((issue) => !before.has(issue));
  if (introduced.length) {
    throw new AiVisualQualityError(
      `The review change introduces deterministic visual defects: ${introduced.join(", ")}`,
    );
  }
  return { beforeIssueCount: before.size, introducedIssues: introduced };
}
