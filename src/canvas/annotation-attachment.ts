import RBush from "rbush";

import { annotationSamples } from "@/canvas/annotation-stroke";
import type { CanvasObjectV2 } from "@/canvas/canvas-document";

type EligibleAttachmentTarget = Extract<
  CanvasObjectV2,
  { type: "shape" | "icon" | "text" | "table" }
>;

type IndexedTarget = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  orderIndex: number;
  object: EligibleAttachmentTarget;
};

export function isEligibleAnnotationTarget(
  object: CanvasObjectV2,
): object is EligibleAttachmentTarget {
  return (
    object.type === "shape" ||
    object.type === "text" ||
    object.type === "table" ||
    object.type === "icon"
  );
}

function pointInTarget(
  target: EligibleAttachmentTarget,
  x: number,
  y: number,
  tolerance: number,
) {
  const { geometry } = target;
  const centerX = geometry.x + geometry.width / 2;
  const centerY = geometry.y + geometry.height / 2;
  if (
    target.type !== "shape" ||
    target.shape === "rectangle" ||
    target.shape === "rounded-rectangle"
  ) {
    return (
      x >= geometry.x - tolerance &&
      x <= geometry.x + geometry.width + tolerance &&
      y >= geometry.y - tolerance &&
      y <= geometry.y + geometry.height + tolerance
    );
  }
  const radiusX = geometry.width / 2 + tolerance;
  const radiusY = geometry.height / 2 + tolerance;
  if (radiusX <= 0 || radiusY <= 0) return false;
  const normalizedX = Math.abs(x - centerX) / radiusX;
  const normalizedY = Math.abs(y - centerY) / radiusY;
  return target.shape === "ellipse"
    ? normalizedX ** 2 + normalizedY ** 2 <= 1
    : normalizedX + normalizedY <= 1;
}

function strokeIntersectsTarget(
  annotation: Extract<CanvasObjectV2, { type: "annotation" }>,
  target: EligibleAttachmentTarget,
) {
  const samples = annotationSamples(annotation);
  const tolerance = Math.max(2, annotation.style.outlineWidth / 2);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index]!;
    const next = samples[index + 1];
    const steps = next
      ? Math.max(
          1,
          Math.ceil(Math.hypot(next.x - sample.x, next.y - sample.y) / 4),
        )
      : 1;
    for (let step = 0; step <= steps; step += 1) {
      const ratio = step / steps;
      const localX = sample.x + (next ? (next.x - sample.x) * ratio : 0);
      const localY = sample.y + (next ? (next.y - sample.y) * ratio : 0);
      if (
        pointInTarget(
          target,
          annotation.geometry.x + localX,
          annotation.geometry.y + localY,
          tolerance,
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

export function findAnnotationAttachmentTarget(
  annotation: Extract<CanvasObjectV2, { type: "annotation" }>,
  objects: CanvasObjectV2[],
) {
  const tree = new RBush<IndexedTarget>();
  tree.load(
    objects.flatMap((object, orderIndex) =>
      isEligibleAnnotationTarget(object)
        ? [
            {
              minX: object.geometry.x,
              minY: object.geometry.y,
              maxX: object.geometry.x + object.geometry.width,
              maxY: object.geometry.y + object.geometry.height,
              orderIndex,
              object,
            },
          ]
        : [],
    ),
  );
  const tolerance = Math.max(2, annotation.style.outlineWidth / 2);
  return (
    tree
      .search({
        minX: annotation.geometry.x - tolerance,
        minY: annotation.geometry.y - tolerance,
        maxX: annotation.geometry.x + annotation.geometry.width + tolerance,
        maxY: annotation.geometry.y + annotation.geometry.height + tolerance,
      })
      .sort((left, right) => right.orderIndex - left.orderIndex)
      .find((candidate) => strokeIntersectsTarget(annotation, candidate.object))
      ?.object ?? null
  );
}
