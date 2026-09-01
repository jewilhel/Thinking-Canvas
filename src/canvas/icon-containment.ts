import type { CanvasObjectV2 } from "@/canvas/canvas-document";

export type ContainableObject = Extract<
  CanvasObjectV2,
  { type: "shape" | "icon" | "text" }
>;
export type ObjectParent = Extract<CanvasObjectV2, { type: "shape" }>;
export type ParentRelativeGeometry = NonNullable<
  ContainableObject["parentRelative"]
>;
export type ChildLayout = NonNullable<ContainableObject["childLayout"]>;
export type IconObject = Extract<CanvasObjectV2, { type: "icon" }>;
export type IconParent = ObjectParent;

export const defaultChildLayout: ChildLayout = {
  pinPosition: true,
  scaleWidth: true,
  scaleHeight: true,
};

export function isContainableObject(
  object: CanvasObjectV2,
): object is ContainableObject {
  return (
    object.type === "shape" || object.type === "icon" || object.type === "text"
  );
}

export function isObjectParent(object: CanvasObjectV2): object is ObjectParent {
  return object.type === "shape" && !object.parentId;
}

export const isIconParent = isObjectParent;

export function rotatePoint(x: number, y: number, rotation: number) {
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

export function parentLocalPoint(parent: ObjectParent, x: number, y: number) {
  return rotatePoint(
    x - parent.geometry.x,
    y - parent.geometry.y,
    -parent.geometry.rotation,
  );
}

export function worldPoint(parent: ObjectParent, x: number, y: number) {
  const rotated = rotatePoint(x, y, parent.geometry.rotation);
  return {
    x: parent.geometry.x + rotated.x,
    y: parent.geometry.y + rotated.y,
  };
}

export function geometryCorners(geometry: CanvasObjectV2["geometry"]) {
  const offsets = [
    [0, 0],
    [geometry.width, 0],
    [geometry.width, geometry.height],
    [0, geometry.height],
  ] as const;
  return offsets.map(([x, y]) => {
    const rotated = rotatePoint(x, y, geometry.rotation);
    return { x: geometry.x + rotated.x, y: geometry.y + rotated.y };
  });
}

export function fullyContains(
  parent: ObjectParent,
  geometry: CanvasObjectV2["geometry"],
) {
  return geometryCorners(geometry).every((corner) => {
    const local = parentLocalPoint(parent, corner.x, corner.y);
    return (
      local.x >= 0 &&
      local.y >= 0 &&
      local.x <= parent.geometry.width &&
      local.y <= parent.geometry.height
    );
  });
}

export function parentRelativeGeometry(
  geometry: CanvasObjectV2["geometry"],
  parent: ObjectParent,
): ParentRelativeGeometry {
  const width = Math.max(parent.geometry.width, Number.EPSILON);
  const height = Math.max(parent.geometry.height, Number.EPSILON);
  const local = parentLocalPoint(parent, geometry.x, geometry.y);
  const rotation = geometry.rotation - parent.geometry.rotation;
  return {
    x: local.x / width,
    y: local.y / height,
    width: geometry.width / width,
    height: geometry.height / height,
    ...(rotation === 0 ? {} : { rotation }),
  };
}

export function childWorldGeometry(
  child: ContainableObject,
  parent: ObjectParent,
) {
  const relative = child.parentRelative;
  if (!relative) return child.geometry;
  const origin = worldPoint(
    parent,
    relative.x * parent.geometry.width,
    relative.y * parent.geometry.height,
  );
  return {
    ...child.geometry,
    x: origin.x,
    y: origin.y,
    width: relative.width * parent.geometry.width,
    height: relative.height * parent.geometry.height,
    rotation: parent.geometry.rotation + (relative.rotation ?? 0),
  };
}

export function childRelativeAfterParentResize(
  child: ContainableObject,
  previousParent: ObjectParent,
  nextParent: ObjectParent,
) {
  const relative =
    child.parentRelative ??
    parentRelativeGeometry(child.geometry, previousParent);
  const layout = child.childLayout ?? defaultChildLayout;
  return {
    ...relative,
    x: layout.pinPosition
      ? relative.x
      : (relative.x * previousParent.geometry.width) /
        Math.max(nextParent.geometry.width, Number.EPSILON),
    y: layout.pinPosition
      ? relative.y
      : (relative.y * previousParent.geometry.height) /
        Math.max(nextParent.geometry.height, Number.EPSILON),
    width: layout.scaleWidth
      ? relative.width
      : (relative.width * previousParent.geometry.width) /
        Math.max(nextParent.geometry.width, Number.EPSILON),
    height: layout.scaleHeight
      ? relative.height
      : (relative.height * previousParent.geometry.height) /
        Math.max(nextParent.geometry.height, Number.EPSILON),
  };
}

export function boundParentGeometryToChildren(
  previousParent: ObjectParent,
  proposedGeometry: CanvasObjectV2["geometry"],
  children: ContainableObject[],
) {
  if (
    !children.length ||
    proposedGeometry.rotation !== previousParent.geometry.rotation
  ) {
    return proposedGeometry;
  }
  const localCorners = children.flatMap((child) =>
    geometryCorners(child.geometry).map((corner) =>
      parentLocalPoint(previousParent, corner.x, corner.y),
    ),
  );
  const proposedOrigin = parentLocalPoint(
    previousParent,
    proposedGeometry.x,
    proposedGeometry.y,
  );
  let left = proposedOrigin.x;
  let top = proposedOrigin.y;
  let right = left + proposedGeometry.width;
  let bottom = top + proposedGeometry.height;
  const minX = Math.min(...localCorners.map((point) => point.x));
  const minY = Math.min(...localCorners.map((point) => point.y));
  const maxX = Math.max(...localCorners.map((point) => point.x));
  const maxY = Math.max(...localCorners.map((point) => point.y));
  const movingLeft = Math.abs(left) > 0.001;
  const movingTop = Math.abs(top) > 0.001;
  if (movingLeft) left = Math.min(left, minX);
  else right = Math.max(right, maxX);
  if (movingTop) top = Math.min(top, minY);
  else bottom = Math.max(bottom, maxY);
  const origin = worldPoint(previousParent, left, top);
  return {
    ...proposedGeometry,
    ...origin,
    width: Math.max(24, right - left),
    height: Math.max(24, bottom - top),
  };
}

export function clampObjectGeometryToParent(
  geometry: CanvasObjectV2["geometry"],
  parent: ObjectParent,
) {
  const width = Math.min(geometry.width, parent.geometry.width);
  const height = Math.min(geometry.height, parent.geometry.height);
  const local = parentLocalPoint(parent, geometry.x, geometry.y);
  const clamped = {
    x: Math.min(Math.max(local.x, 0), parent.geometry.width - width),
    y: Math.min(Math.max(local.y, 0), parent.geometry.height - height),
  };
  const origin = worldPoint(parent, clamped.x, clamped.y);
  return { ...geometry, ...origin, width, height };
}

export const clampIconGeometryToParent = clampObjectGeometryToParent;
