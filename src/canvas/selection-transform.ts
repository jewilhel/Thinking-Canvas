import type { CanvasObjectV2 } from "@/canvas/canvas-document";

export type SelectionBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

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
