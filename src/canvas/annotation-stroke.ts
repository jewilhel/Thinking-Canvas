import { getStroke } from "perfect-freehand";

import type { CanvasObjectV2 } from "@/canvas/canvas-document";

export type AnnotationPointerType = "mouse" | "touch" | "pen";
export type AnnotationInk = "pen" | "highlighter";

export type AnnotationSample = {
  x: number;
  y: number;
  pressure: number;
};

export const maxAnnotationSamples = 2_048;
export const defaultAnnotationColor = "#6d28d9";
export const defaultAnnotationThickness = 5;
export const defaultHighlighterThickness = 16;
export const highlighterOpacity = 0.36;

export function normalizeAnnotationPressure(
  pointerType: string,
  pressure: number,
) {
  if (
    (pointerType === "pen" || pointerType === "touch") &&
    Number.isFinite(pressure) &&
    pressure > 0 &&
    pressure <= 1
  ) {
    return pressure;
  }
  return 0.5;
}

function distance(left: AnnotationSample, right: AnnotationSample) {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

export function simplifyAnnotationSamples(
  input: AnnotationSample[],
  minimumDistance = 0.5,
) {
  if (input.length < 2) return input;
  const filtered = [input[0]!];
  for (const sample of input.slice(1, -1)) {
    if (distance(filtered.at(-1)!, sample) >= minimumDistance) {
      filtered.push(sample);
    }
  }
  const last = input.at(-1)!;
  if (distance(filtered.at(-1)!, last) > 0) filtered.push(last);
  if (filtered.length <= maxAnnotationSamples) return filtered;

  return Array.from({ length: maxAnnotationSamples }, (_, index) => {
    const sourceIndex = Math.round(
      (index * (filtered.length - 1)) / (maxAnnotationSamples - 1),
    );
    return filtered[sourceIndex]!;
  });
}

export function canonicalizeAnnotationSamples(
  input: AnnotationSample[],
  thickness: number,
) {
  const samples = simplifyAnnotationSamples(input);
  if (
    samples.length < 2 ||
    samples.every((sample) => distance(samples[0]!, sample) < 0.5)
  ) {
    return null;
  }

  const xs = samples.map((sample) => sample.x);
  const ys = samples.map((sample) => sample.y);
  const padding = Math.max(1, thickness);
  const x = Math.min(...xs) - padding;
  const y = Math.min(...ys) - padding;
  const width = Math.max(1, Math.max(...xs) - Math.min(...xs) + padding * 2);
  const height = Math.max(1, Math.max(...ys) - Math.min(...ys) + padding * 2);

  return {
    geometry: { x, y, width, height, rotation: 0 },
    points: samples.flatMap((sample) => [sample.x - x, sample.y - y]),
    pressures: samples.map((sample) => sample.pressure),
  };
}

export function annotationSamples(
  object: Extract<CanvasObjectV2, { type: "annotation" }>,
) {
  const scaleX =
    object.geometry.width / ((object.baseWidth ?? object.geometry.width) || 1);
  const scaleY =
    object.geometry.height /
    ((object.baseHeight ?? object.geometry.height) || 1);
  return Array.from({ length: object.points.length / 2 }, (_, index) => ({
    x: object.points[index * 2]! * scaleX,
    y: object.points[index * 2 + 1]! * scaleY,
    pressure: object.pressures?.[index] ?? 0.5,
  }));
}

export function annotationCenterlinePoints(
  object: Extract<CanvasObjectV2, { type: "annotation" }>,
) {
  return annotationSamples(object).flatMap((sample) => [sample.x, sample.y]);
}

export function annotationOutlinePoints(
  samples: AnnotationSample[],
  thickness: number,
  last = true,
) {
  if (samples.length < 2) return [];
  return getStroke(
    samples.map((sample) => [sample.x, sample.y, sample.pressure]),
    {
      size: thickness,
      thinning: 0.55,
      smoothing: 0.65,
      streamline: 0.4,
      simulatePressure: false,
      last,
    },
  ).flatMap(([x, y]) => [x, y]);
}
