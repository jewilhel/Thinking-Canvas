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

export type HorizontalConstraint =
  "left" | "right" | "left-right" | "center" | "scale";
export type VerticalConstraint =
  "top" | "bottom" | "top-bottom" | "center" | "scale";

export const defaultChildLayout: ChildLayout = {
  horizontalConstraint: "left",
  verticalConstraint: "top",
};

export const shapeLabelChildLayout: ChildLayout = {
  horizontalConstraint: "left-right",
  verticalConstraint: "top-bottom",
};

export function childConstraints(
  layout: ChildLayout,
  childRole?: "shape-label" | null,
) {
  if (layout.horizontalConstraint && layout.verticalConstraint) {
    return {
      horizontal: layout.horizontalConstraint,
      vertical: layout.verticalConstraint,
    };
  }
  if (childRole === "shape-label") {
    return { horizontal: "left-right", vertical: "top-bottom" } as const;
  }
  const horizontalPosition =
    layout.horizontalPosition ??
    (layout.pinPosition === false ? "fixed" : "pin");
  const verticalPosition =
    layout.verticalPosition ?? (layout.pinPosition === false ? "fixed" : "pin");
  return {
    horizontal:
      horizontalPosition === "center"
        ? "center"
        : layout.scaleWidth
          ? "scale"
          : "left",
    vertical:
      verticalPosition === "center"
        ? "center"
        : layout.scaleHeight
          ? "scale"
          : "top",
  } as const;
}

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

export function parentFirstObjectOrder(objects: CanvasObjectV2[]) {
  const objectsById = new Map(objects.map((object) => [object.id, object]));
  const childrenByParent = new Map<string, CanvasObjectV2[]>();
  const nestedIds = new Set<string>();
  for (const object of objects) {
    if (!isContainableObject(object) || !object.parentId) continue;
    const parent = objectsById.get(object.parentId);
    if (!parent || !isObjectParent(parent)) continue;
    nestedIds.add(object.id);
    const children = childrenByParent.get(parent.id) ?? [];
    children.push(object);
    childrenByParent.set(parent.id, children);
  }
  return objects.flatMap((object) =>
    nestedIds.has(object.id)
      ? []
      : [object, ...(childrenByParent.get(object.id) ?? [])],
  );
}

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

export function geometryLocalPoint(
  geometry: CanvasObjectV2["geometry"],
  x: number,
  y: number,
) {
  return rotatePoint(x - geometry.x, y - geometry.y, -geometry.rotation);
}

export function geometryContainsPoint(
  geometry: CanvasObjectV2["geometry"],
  x: number,
  y: number,
) {
  const local = geometryLocalPoint(geometry, x, y);
  return (
    local.x >= 0 &&
    local.y >= 0 &&
    local.x <= geometry.width &&
    local.y <= geometry.height
  );
}

export function geometryClipPolygonInLocalSpace(
  clipGeometry: CanvasObjectV2["geometry"],
  localGeometry: CanvasObjectV2["geometry"],
) {
  return geometryCorners(clipGeometry).map((point) =>
    geometryLocalPoint(localGeometry, point.x, point.y),
  );
}

export function rotateGeometryAroundCenter(
  geometry: CanvasObjectV2["geometry"],
  rotation: number,
) {
  const previousHalf = rotatePoint(
    geometry.width / 2,
    geometry.height / 2,
    geometry.rotation,
  );
  const center = {
    x: geometry.x + previousHalf.x,
    y: geometry.y + previousHalf.y,
  };
  const nextHalf = rotatePoint(
    geometry.width / 2,
    geometry.height / 2,
    rotation,
  );
  return {
    ...geometry,
    x: center.x - nextHalf.x,
    y: center.y - nextHalf.y,
    rotation,
  };
}

export function flipGeometryWithinParent(
  geometry: CanvasObjectV2["geometry"],
  parent: ObjectParent,
  axis: "horizontal" | "vertical",
) {
  const half = rotatePoint(
    geometry.width / 2,
    geometry.height / 2,
    geometry.rotation,
  );
  const center = {
    x: geometry.x + half.x,
    y: geometry.y + half.y,
  };
  const localCenter = parentLocalPoint(parent, center.x, center.y);
  const mirroredCenter = worldPoint(
    parent,
    axis === "horizontal"
      ? parent.geometry.width - localCenter.x
      : localCenter.x,
    axis === "vertical"
      ? parent.geometry.height - localCenter.y
      : localCenter.y,
  );
  const relativeRotation = geometry.rotation - parent.geometry.rotation;
  const rotation = parent.geometry.rotation - relativeRotation;
  const nextHalf = rotatePoint(
    geometry.width / 2,
    geometry.height / 2,
    rotation,
  );
  return {
    ...geometry,
    x: mirroredCenter.x - nextHalf.x,
    y: mirroredCenter.y - nextHalf.y,
    rotation,
    ...(axis === "horizontal" ? { flipX: !geometry.flipX } : {}),
    ...(axis === "vertical" ? { flipY: !geometry.flipY } : {}),
  };
}

export type RotationCorner =
  "top-left" | "top-right" | "bottom-left" | "bottom-right";

export function rotationHandleWorldPoint(
  geometry: CanvasObjectV2["geometry"],
  corner: RotationCorner,
  offset: number,
) {
  const local = {
    x: corner.endsWith("right") ? geometry.width + offset : -offset,
    y: corner.startsWith("bottom") ? geometry.height + offset : -offset,
  };
  const rotated = rotatePoint(local.x, local.y, geometry.rotation);
  return { x: geometry.x + rotated.x, y: geometry.y + rotated.y };
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
  child: Pick<ContainableObject, "geometry" | "parentRelative">,
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
  child: Pick<
    ContainableObject,
    "geometry" | "parentRelative" | "childLayout"
  > & {
    childRole?: "shape-label" | null;
  },
  previousParent: ObjectParent,
  nextParent: ObjectParent,
) {
  const relative =
    child.parentRelative ??
    parentRelativeGeometry(child.geometry, previousParent);
  const layout = child.childLayout ?? defaultChildLayout;
  const constraints = childConstraints(layout, child.childRole);
  const previousWidth = previousParent.geometry.width;
  const previousHeight = previousParent.geometry.height;
  const nextWidth = Math.max(nextParent.geometry.width, Number.EPSILON);
  const nextHeight = Math.max(nextParent.geometry.height, Number.EPSILON);
  const absoluteX = relative.x * previousWidth;
  const absoluteY = relative.y * previousHeight;
  const absoluteWidth = relative.width * previousWidth;
  const absoluteHeight = relative.height * previousHeight;
  const right = previousWidth - absoluteX - absoluteWidth;
  const bottom = previousHeight - absoluteY - absoluteHeight;

  let x = relative.x;
  let width = relative.width;
  if (constraints.horizontal === "left") {
    x = absoluteX / nextWidth;
    width = absoluteWidth / nextWidth;
  } else if (constraints.horizontal === "right") {
    width = absoluteWidth / nextWidth;
    x = (nextWidth - right - absoluteWidth) / nextWidth;
  } else if (constraints.horizontal === "left-right") {
    x = absoluteX / nextWidth;
    width = Math.max(0, nextWidth - absoluteX - right) / nextWidth;
  } else if (constraints.horizontal === "center") {
    width = absoluteWidth / nextWidth;
    x = 0.5 - width / 2;
  }

  let y = relative.y;
  let height = relative.height;
  if (constraints.vertical === "top") {
    y = absoluteY / nextHeight;
    height = absoluteHeight / nextHeight;
  } else if (constraints.vertical === "bottom") {
    height = absoluteHeight / nextHeight;
    y = (nextHeight - bottom - absoluteHeight) / nextHeight;
  } else if (constraints.vertical === "top-bottom") {
    y = absoluteY / nextHeight;
    height = Math.max(0, nextHeight - absoluteY - bottom) / nextHeight;
  } else if (constraints.vertical === "center") {
    height = absoluteHeight / nextHeight;
    y = 0.5 - height / 2;
  }

  return {
    ...relative,
    x,
    y,
    width,
    height,
  };
}

export function boundParentGeometryToChildren(
  previousParent: ObjectParent,
  proposedGeometry: CanvasObjectV2["geometry"],
  children: Array<Pick<ContainableObject, "geometry">>,
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
