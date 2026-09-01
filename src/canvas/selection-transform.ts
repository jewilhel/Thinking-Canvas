import type { CanvasObjectV2 } from "@/canvas/canvas-document";
import { geometryCorners, rotatePoint } from "@/canvas/icon-containment";

export type SelectionBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function selectionBoundsForObjects(objects: CanvasObjectV2[]) {
  const eligible = objects.filter((object) => object.type !== "connector");
  if (!eligible.length) return null;
  const corners = eligible.flatMap((object) =>
    geometryCorners(object.geometry),
  );
  const left = Math.min(...corners.map((point) => point.x));
  const top = Math.min(...corners.map((point) => point.y));
  const right = Math.max(...corners.map((point) => point.x));
  const bottom = Math.max(...corners.map((point) => point.y));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function rotateSelectionObjects(
  objects: CanvasObjectV2[],
  frame: SelectionBounds & { rotation?: number },
  rotation: number,
) {
  const previousRotation = frame.rotation ?? 0;
  const delta = rotation - previousRotation;
  const previousHalf = rotatePoint(
    frame.width / 2,
    frame.height / 2,
    previousRotation,
  );
  const center = { x: frame.x + previousHalf.x, y: frame.y + previousHalf.y };
  return objects.map((object): CanvasObjectV2 => {
    if (object.type === "connector") return object;
    const half = rotatePoint(
      object.geometry.width / 2,
      object.geometry.height / 2,
      object.geometry.rotation,
    );
    const objectCenter = {
      x: object.geometry.x + half.x,
      y: object.geometry.y + half.y,
    };
    const nextCenterOffset = rotatePoint(
      objectCenter.x - center.x,
      objectCenter.y - center.y,
      delta,
    );
    const nextRotation = object.geometry.rotation + delta;
    const nextHalf = rotatePoint(
      object.geometry.width / 2,
      object.geometry.height / 2,
      nextRotation,
    );
    return {
      ...object,
      geometry: {
        ...object.geometry,
        x: center.x + nextCenterOffset.x - nextHalf.x,
        y: center.y + nextCenterOffset.y - nextHalf.y,
        rotation: nextRotation,
      },
    };
  });
}

function mapCoordinate(
  value: number,
  sourceStart: number,
  sourceSize: number,
  targetStart: number,
  targetSize: number,
) {
  if (sourceSize === 0) return targetStart;
  return targetStart + ((value - sourceStart) / sourceSize) * targetSize;
}

export function transformSelectionObjects(
  objects: CanvasObjectV2[],
  source: SelectionBounds,
  target: SelectionBounds,
) {
  const scaleX = target.width / Math.max(1, source.width);
  const scaleY = target.height / Math.max(1, source.height);

  return objects.map((object): CanvasObjectV2 => {
    if (object.type === "connector") {
      const transformEndpoint = (endpoint: typeof object.start) =>
        endpoint.kind === "free"
          ? {
              kind: "free" as const,
              x: mapCoordinate(
                endpoint.x,
                source.x,
                source.width,
                target.x,
                target.width,
              ),
              y: mapCoordinate(
                endpoint.y,
                source.y,
                source.height,
                target.y,
                target.height,
              ),
            }
          : endpoint;
      return {
        ...object,
        start: transformEndpoint(object.start),
        end: transformEndpoint(object.end),
      };
    }

    return {
      ...object,
      geometry: {
        ...object.geometry,
        x: mapCoordinate(
          object.geometry.x,
          source.x,
          source.width,
          target.x,
          target.width,
        ),
        y: mapCoordinate(
          object.geometry.y,
          source.y,
          source.height,
          target.y,
          target.height,
        ),
        width: Math.max(1, object.geometry.width * scaleX),
        height: Math.max(1, object.geometry.height * scaleY),
      },
    };
  });
}
