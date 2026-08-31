import type { CanvasObjectV2 } from "@/canvas/canvas-document";

export type IconObject = Extract<CanvasObjectV2, { type: "icon" }>;
export type IconParent = Extract<CanvasObjectV2, { type: "shape" }>;
export type ParentRelativeGeometry = NonNullable<IconObject["parentRelative"]>;

export function isIconParent(object: CanvasObjectV2): object is IconParent {
  return object.type === "shape";
}

export function fullyContains(
  parent: IconParent,
  geometry: CanvasObjectV2["geometry"],
) {
  return (
    geometry.x >= parent.geometry.x &&
    geometry.y >= parent.geometry.y &&
    geometry.x + geometry.width <= parent.geometry.x + parent.geometry.width &&
    geometry.y + geometry.height <= parent.geometry.y + parent.geometry.height
  );
}

export function parentRelativeGeometry(
  geometry: CanvasObjectV2["geometry"],
  parent: IconParent,
): ParentRelativeGeometry {
  const width = Math.max(parent.geometry.width, Number.EPSILON);
  const height = Math.max(parent.geometry.height, Number.EPSILON);
  return {
    x: (geometry.x - parent.geometry.x) / width,
    y: (geometry.y - parent.geometry.y) / height,
    width: geometry.width / width,
    height: geometry.height / height,
  };
}

export function childWorldGeometry(child: IconObject, parent: IconParent) {
  const relative = child.parentRelative;
  if (!relative) return child.geometry;
  return {
    ...child.geometry,
    x: parent.geometry.x + relative.x * parent.geometry.width,
    y: parent.geometry.y + relative.y * parent.geometry.height,
    width: relative.width * parent.geometry.width,
    height: relative.height * parent.geometry.height,
  };
}

export function clampIconGeometryToParent(
  geometry: CanvasObjectV2["geometry"],
  parent: IconParent,
) {
  const width = Math.min(geometry.width, parent.geometry.width);
  const height = Math.min(geometry.height, parent.geometry.height);
  return {
    ...geometry,
    width,
    height,
    x: Math.min(
      Math.max(geometry.x, parent.geometry.x),
      parent.geometry.x + parent.geometry.width - width,
    ),
    y: Math.min(
      Math.max(geometry.y, parent.geometry.y),
      parent.geometry.y + parent.geometry.height - height,
    ),
  };
}
