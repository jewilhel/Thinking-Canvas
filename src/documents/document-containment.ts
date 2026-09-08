import type { CanvasObjectV2 } from "@/canvas/canvas-document";
import {
  geometryCorners,
  geometryLocalPoint,
  rotatePoint,
} from "@/canvas/icon-containment";
import {
  documentReadingSurfaceHeight,
  documentReadingSurfaceWidth,
} from "@/documents/document-presentation";

export type ProductDocumentCanvasObject = Extract<
  CanvasObjectV2,
  { type: "document" }
>;

export type DocumentOwnableObject = Exclude<
  CanvasObjectV2,
  ProductDocumentCanvasObject
>;

export type DocumentLocalGeometry = NonNullable<
  DocumentOwnableObject["documentLocal"]
>;

export function isDocumentOwnableObject(
  object: CanvasObjectV2,
): object is DocumentOwnableObject {
  return object.type !== "document";
}

export function documentViewportDimensions(
  documentObject: ProductDocumentCanvasObject,
) {
  const width = documentReadingSurfaceWidth(documentObject.settings);
  const paginatedHeight = documentReadingSurfaceHeight(documentObject.settings);
  const scale = width / Math.max(documentObject.geometry.width, Number.EPSILON);
  return {
    width,
    height: paginatedHeight ?? documentObject.geometry.height * scale,
    scale,
  };
}

export function documentFullyContainsGeometry(
  documentObject: ProductDocumentCanvasObject,
  geometry: CanvasObjectV2["geometry"],
) {
  return geometryCorners(geometry).every((corner) => {
    const local = geometryLocalPoint(
      documentObject.geometry,
      corner.x,
      corner.y,
    );
    return (
      local.x >= 0 &&
      local.y >= 0 &&
      local.x <= documentObject.geometry.width &&
      local.y <= documentObject.geometry.height
    );
  });
}

export function documentLocalGeometry(
  documentObject: ProductDocumentCanvasObject,
  geometry: CanvasObjectV2["geometry"],
) {
  const viewport = documentViewportDimensions(documentObject);
  const local = geometryLocalPoint(
    documentObject.geometry,
    geometry.x,
    geometry.y,
  );
  const rotation = geometry.rotation - documentObject.geometry.rotation;
  return {
    x: local.x * viewport.scale,
    y: local.y * viewport.scale,
    width: geometry.width * viewport.scale,
    height: geometry.height * viewport.scale,
    rotation,
    pageIndex: Math.max(
      0,
      Math.floor((local.y * viewport.scale) / viewport.height),
    ),
  };
}

export function documentFullyContainsLocalGeometry(
  documentObject: ProductDocumentCanvasObject,
  local: DocumentLocalGeometry,
) {
  const viewport = documentViewportDimensions(documentObject);
  const pageTop = local.pageIndex * viewport.height;
  const pageBottom = pageTop + viewport.height;
  return geometryCorners(local).every(
    (corner) =>
      corner.x >= 0 &&
      corner.x <= viewport.width &&
      corner.y >= pageTop &&
      corner.y <= pageBottom,
  );
}

export function documentWorldGeometry(
  documentObject: ProductDocumentCanvasObject,
  local: DocumentLocalGeometry,
  previous: CanvasObjectV2["geometry"],
) {
  const viewport = documentViewportDimensions(documentObject);
  const origin = rotatePoint(
    local.x / viewport.scale,
    local.y / viewport.scale,
    documentObject.geometry.rotation,
  );
  return {
    ...previous,
    x: documentObject.geometry.x + origin.x,
    y: documentObject.geometry.y + origin.y,
    width: local.width / viewport.scale,
    height: local.height / viewport.scale,
    rotation: documentObject.geometry.rotation + local.rotation,
  };
}

export function isDocumentOwned(
  value: CanvasObjectV2,
): value is DocumentOwnableObject & {
  documentOwnerId: string;
  documentLocal: DocumentLocalGeometry;
} {
  return (
    isDocumentOwnableObject(value) &&
    value.documentOwnerId != null &&
    value.documentLocal != null
  );
}
