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

type Point = { x: number; y: number };

function distanceToSegment(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0)
    return Math.hypot(point.x - start.x, point.y - start.y);
  const amount = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
    ),
  );
  return Math.hypot(
    point.x - (start.x + amount * dx),
    point.y - (start.y + amount * dy),
  );
}

function orientation(first: Point, second: Point, third: Point) {
  return (
    (second.x - first.x) * (third.y - first.y) -
    (second.y - first.y) * (third.x - first.x)
  );
}

function segmentsIntersect(
  firstStart: Point,
  firstEnd: Point,
  secondStart: Point,
  secondEnd: Point,
) {
  const firstSide = orientation(firstStart, firstEnd, secondStart);
  const secondSide = orientation(firstStart, firstEnd, secondEnd);
  const thirdSide = orientation(secondStart, secondEnd, firstStart);
  const fourthSide = orientation(secondStart, secondEnd, firstEnd);
  const onSegment = (start: Point, point: Point, end: Point) =>
    point.x >= Math.min(start.x, end.x) &&
    point.x <= Math.max(start.x, end.x) &&
    point.y >= Math.min(start.y, end.y) &&
    point.y <= Math.max(start.y, end.y);
  if (firstSide === 0 && onSegment(firstStart, secondStart, firstEnd)) {
    return true;
  }
  if (secondSide === 0 && onSegment(firstStart, secondEnd, firstEnd)) {
    return true;
  }
  if (thirdSide === 0 && onSegment(secondStart, firstStart, secondEnd)) {
    return true;
  }
  if (fourthSide === 0 && onSegment(secondStart, firstEnd, secondEnd)) {
    return true;
  }
  return (
    ((firstSide < 0 && secondSide > 0) || (firstSide > 0 && secondSide < 0)) &&
    ((thirdSide < 0 && fourthSide > 0) || (thirdSide > 0 && fourthSide < 0))
  );
}

function segmentDistance(
  firstStart: Point,
  firstEnd: Point,
  secondStart: Point,
  secondEnd: Point,
) {
  if (segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd)) return 0;
  return Math.min(
    distanceToSegment(firstStart, secondStart, secondEnd),
    distanceToSegment(firstEnd, secondStart, secondEnd),
    distanceToSegment(secondStart, firstStart, firstEnd),
    distanceToSegment(secondEnd, firstStart, firstEnd),
  );
}

export function annotationIntersectsEraserSegment(
  object: Extract<CanvasObjectV2, { type: "annotation" }>,
  eraserStart: Point,
  eraserEnd: Point,
  tolerance: number,
) {
  const radians = (object.geometry.rotation * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const samples = annotationSamples(object).map((sample) => ({
    x: object.geometry.x + sample.x * cosine - sample.y * sine,
    y: object.geometry.y + sample.x * sine + sample.y * cosine,
  }));
  const hitDistance = Math.max(0, tolerance) + object.style.outlineWidth / 2;
  if (samples.length === 1) {
    return (
      distanceToSegment(samples[0]!, eraserStart, eraserEnd) <= hitDistance
    );
  }
  return samples
    .slice(1)
    .some(
      (sample, index) =>
        segmentDistance(eraserStart, eraserEnd, samples[index]!, sample) <=
        hitDistance,
    );
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
