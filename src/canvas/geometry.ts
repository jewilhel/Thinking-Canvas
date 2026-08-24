import type { CanvasObject } from "@/domain/canvas-object";
import type { CanvasObjectV2 } from "@/canvas/canvas-document";

export type Point = { x: number; y: number };
export type Viewport = { x: number; y: number; scale: number };

export const minCanvasScale = 0.25;
export const maxCanvasScale = 3;
export const baseCanvasGridSpacing = 24;
export const selectionAffordanceVisibilityThreshold = 0.45;

export function selectionAffordanceScale(scale: number) {
  if (!Number.isFinite(scale) || scale < selectionAffordanceVisibilityThreshold)
    return 0;
  return Math.min(1, scale);
}

export function canvasWheelIntent(event: {
  ctrlKey: boolean;
  deltaMode: number;
  deltaX: number;
  deltaY: number;
}): "pan" | "zoom" {
  if (event.ctrlKey || event.deltaMode !== 0) return "zoom";
  if (event.deltaX !== 0) return "pan";
  if (!Number.isInteger(event.deltaY) || Math.abs(event.deltaY) < 80)
    return "pan";
  return "zoom";
}

export function zoomViewportAtPointer(
  viewport: Viewport,
  pointer: Point,
  wheelDelta: number,
): Viewport {
  const direction = wheelDelta > 0 ? -1 : 1;
  const scale = Math.min(
    maxCanvasScale,
    Math.max(minCanvasScale, viewport.scale * 1.08 ** direction),
  );
  return zoomViewportToScale(viewport, pointer, scale);
}

export function zoomViewportAtPointerContinuously(
  viewport: Viewport,
  pointer: Point,
  wheelDelta: number,
): Viewport {
  const boundedDelta = Math.max(-60, Math.min(60, wheelDelta));
  const scale = Math.min(
    maxCanvasScale,
    Math.max(minCanvasScale, viewport.scale * Math.exp(-boundedDelta * 0.003)),
  );
  return zoomViewportToScale(viewport, pointer, scale);
}

function zoomViewportToScale(
  viewport: Viewport,
  pointer: Point,
  scale: number,
): Viewport {
  const worldPoint = {
    x: (pointer.x - viewport.x) / viewport.scale,
    y: (pointer.y - viewport.y) / viewport.scale,
  };

  return {
    x: pointer.x - worldPoint.x * scale,
    y: pointer.y - worldPoint.y * scale,
    scale,
  };
}

export function canvasGridMetrics(viewport: Viewport) {
  const spacing = baseCanvasGridSpacing * viewport.scale;
  const wrap = (value: number) => ((value % spacing) + spacing) % spacing;
  return {
    spacing,
    dotRadius: Math.max(0.5, Math.min(2, viewport.scale)),
    x: wrap(viewport.x),
    y: wrap(viewport.y),
  };
}

export function normalizeTransformedGeometry(
  object: CanvasObject,
  scaleX: number,
  scaleY: number,
): CanvasObject["geometry"] {
  return {
    ...object.geometry,
    width: Math.max(24, object.geometry.width * Math.abs(scaleX)),
    height: Math.max(24, object.geometry.height * Math.abs(scaleY)),
  };
}

export function proportionalTextLayoutDuringResize(
  frame: { x: number; y: number; width: number; height: number },
  scaleX: number,
  scaleY: number,
) {
  const safeScaleX = Math.abs(scaleX) < 0.001 ? 1 : scaleX;
  const safeScaleY = Math.abs(scaleY) < 0.001 ? 1 : scaleY;
  return {
    x: frame.x / safeScaleX,
    y: frame.y / safeScaleY,
    width: Math.max(0, frame.width),
    height: Math.max(0, frame.height),
    scaleX: 1 / safeScaleX,
    scaleY: 1 / safeScaleY,
  };
}

export function previewGeometryDuringTransform(
  geometry: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  },
  transform: { x: number; y: number; scaleX: number; scaleY: number },
) {
  return {
    ...geometry,
    x: transform.x,
    y: transform.y,
    width: Math.max(24, geometry.width * Math.abs(transform.scaleX)),
    height: Math.max(24, geometry.height * Math.abs(transform.scaleY)),
  };
}

function center(object: CanvasObject): Point {
  return {
    x: object.geometry.x + object.geometry.width / 2,
    y: object.geometry.y + object.geometry.height / 2,
  };
}

export function anchorToward(object: CanvasObject, target: Point): Point {
  const objectCenter = center(object);
  const dx = target.x - objectCenter.x;
  const dy = target.y - objectCenter.y;
  const halfWidth = object.geometry.width / 2;
  const halfHeight = object.geometry.height / 2;

  if (
    Math.abs(dx / Math.max(halfWidth, 1)) >
    Math.abs(dy / Math.max(halfHeight, 1))
  ) {
    return {
      x: objectCenter.x + Math.sign(dx || 1) * halfWidth,
      y: objectCenter.y,
    };
  }

  return {
    x: objectCenter.x,
    y: objectCenter.y + Math.sign(dy || 1) * halfHeight,
  };
}

export function resolveConnectorPoints(
  connector: Extract<CanvasObject, { type: "connector" }>,
  objectsById: ReadonlyMap<string, CanvasObject>,
): number[] {
  const start = connector.startObjectId
    ? objectsById.get(connector.startObjectId)
    : undefined;
  const end = connector.endObjectId
    ? objectsById.get(connector.endObjectId)
    : undefined;

  if (!start || !end) return connector.points;

  const startCenter = center(start);
  const endCenter = center(end);
  const startAnchor = anchorToward(start, endCenter);
  const endAnchor = anchorToward(end, startCenter);
  return [startAnchor.x, startAnchor.y, endAnchor.x, endAnchor.y];
}

export type CanvasAnchor = "top" | "right" | "bottom" | "left" | "center";

export function anchorPointV2(
  object: CanvasObjectV2,
  anchor: CanvasAnchor,
): Point {
  const { x, y, width, height } = object.geometry;
  if (anchor === "top") return { x: x + width / 2, y };
  if (anchor === "right") return { x: x + width, y: y + height / 2 };
  if (anchor === "bottom") return { x: x + width / 2, y: y + height };
  if (anchor === "left") return { x, y: y + height / 2 };
  return { x: x + width / 2, y: y + height / 2 };
}

export function connectionHandlePointV2(
  object: CanvasObjectV2,
  anchor: CanvasAnchor,
  offset: number,
): Point {
  const point = anchorPointV2(object, anchor);
  if (anchor === "top") return { x: point.x, y: point.y - offset };
  if (anchor === "right") return { x: point.x + offset, y: point.y };
  if (anchor === "bottom") return { x: point.x, y: point.y + offset };
  if (anchor === "left") return { x: point.x - offset, y: point.y };
  return point;
}

export function pointWithinObjectHoverZone(
  object: CanvasObjectV2,
  point: Point,
  distance: number,
) {
  if (object.type === "connector") return false;
  const { x, y, width, height } = object.geometry;
  return (
    point.x >= x - distance &&
    point.x <= x + width + distance &&
    point.y >= y - distance &&
    point.y <= y + height + distance
  );
}

export function resolveConnectorEndpointV2(
  endpoint: Extract<CanvasObjectV2, { type: "connector" }>["start"],
  objectsById: ReadonlyMap<string, CanvasObjectV2>,
): Point {
  if (endpoint.kind === "free") return { x: endpoint.x, y: endpoint.y };
  const object = objectsById.get(endpoint.objectId);
  return object ? anchorPointV2(object, endpoint.anchor) : { x: 0, y: 0 };
}

export function resolveConnectorPointsV2(
  connector: Extract<CanvasObjectV2, { type: "connector" }>,
  objectsById: ReadonlyMap<string, CanvasObjectV2>,
) {
  const start = resolveConnectorEndpointV2(connector.start, objectsById);
  const end = resolveConnectorEndpointV2(connector.end, objectsById);
  return [start.x, start.y, end.x, end.y];
}
