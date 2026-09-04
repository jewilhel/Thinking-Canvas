import * as Y from "yjs";

import type { DocumentSettings } from "@/documents/document-schema";

export const documentPageDimensions = {
  letter: { width: 816, height: 1056 },
  a4: { width: 794, height: 1123 },
} as const;

export const documentDisplayFonts = {
  sans: "Inter, ui-sans-serif, system-ui, sans-serif",
  serif: "Georgia, ui-serif, serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
} as const;

export const documentReadingMetrics = {
  compact: { fontSize: 15, lineHeight: 1.55 },
  comfortable: { fontSize: 17, lineHeight: 1.7 },
  large: { fontSize: 20, lineHeight: 1.8 },
} as const;

export function focusedDocumentViewport(input: {
  canvasWidth: number;
  canvasHeight: number;
  geometry: { x: number; y: number; width: number; height: number };
  minimumScale: number;
  maximumScale: number;
}) {
  const horizontalInset = Math.min(64, input.canvasWidth * 0.08);
  const topInset = Math.min(96, input.canvasHeight * 0.16);
  const bottomInset = Math.min(24, input.canvasHeight * 0.05);
  const availableWidth = Math.max(240, input.canvasWidth - horizontalInset * 2);
  const availableHeight = Math.max(
    280,
    input.canvasHeight - topInset - bottomInset,
  );
  const scale = Math.min(
    input.maximumScale,
    Math.max(
      input.minimumScale,
      Math.min(
        availableWidth / input.geometry.width,
        availableHeight / input.geometry.height,
      ),
    ),
  );
  const renderedWidth = input.geometry.width * scale;
  const renderedHeight = input.geometry.height * scale;
  const left = (input.canvasWidth - renderedWidth) / 2;
  const top = topInset + (availableHeight - renderedHeight) / 2;
  return {
    scale,
    x: left - input.geometry.x * scale,
    y: top - input.geometry.y * scale,
    screenBounds: {
      left,
      top,
      width: renderedWidth,
      height: renderedHeight,
    },
  };
}

export function documentLayoutLabel(settings: DocumentSettings) {
  if (settings.layout.mode === "continuous") return "Continuous";
  return `${settings.layout.pageSize === "letter" ? "US Letter" : "A4"} · ${settings.layout.orientation}`;
}

export function documentReadingSurfaceWidth(settings: DocumentSettings) {
  if (settings.layout.mode === "continuous") return 820;
  const dimensions = documentPageDimensions[settings.layout.pageSize];
  return settings.layout.orientation === "portrait"
    ? dimensions.width
    : dimensions.height;
}

export function documentReadingSurfaceHeight(settings: DocumentSettings) {
  if (settings.layout.mode === "continuous") return null;
  const dimensions = documentPageDimensions[settings.layout.pageSize];
  return settings.layout.orientation === "portrait"
    ? dimensions.height
    : dimensions.width;
}

export function documentPageContentHeight(settings: DocumentSettings) {
  const height = documentReadingSurfaceHeight(settings);
  return height === null ? null : Math.max(320, height - 192);
}

function sharedText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Y.XmlText || value instanceof Y.Text) {
    return value
      .toDelta()
      .map((operation: { insert: unknown }) => sharedText(operation.insert))
      .join("");
  }
  if (value instanceof Y.XmlElement || value instanceof Y.XmlFragment) {
    return value.toArray().map(sharedText).join("\n");
  }
  return "";
}

export function documentPreviewText(
  root: Y.Text | Y.XmlText,
  maximumCharacters = 420,
) {
  const normalized = sharedText(root)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (normalized.length <= maximumCharacters) return normalized;
  return `${normalized.slice(0, Math.max(0, maximumCharacters - 1)).trimEnd()}…`;
}
