import sharp from "sharp";

import type { CanvasObjectV2 } from "@/canvas/canvas-document";

export type TargetedCanvasCapture = {
  dataUrl: string;
  width: number;
  height: number;
  targetObjectIds: string[];
  contextObjectIds: string[];
};

export const TARGETED_CAPTURE_RENDERER_VERSION = 1;

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function intersects(
  object: CanvasObjectV2,
  bounds: { x: number; y: number; right: number; bottom: number },
) {
  const { geometry } = object;
  return !(
    geometry.x + geometry.width < bounds.x ||
    geometry.x > bounds.right ||
    geometry.y + geometry.height < bounds.y ||
    geometry.y > bounds.bottom
  );
}

function objectSvg(object: CanvasObjectV2) {
  const { x, y, width, height, rotation } = object.geometry;
  const fill = object.style.fill ?? "transparent";
  const stroke = object.style.outline ?? "#71717a";
  const strokeWidth = object.style.outlineWidth ?? 1;
  const transform = rotation
    ? ` transform="rotate(${rotation} ${x + width / 2} ${y + height / 2})"`
    : "";
  if (object.type === "connector") {
    const start = object.start.kind === "free" ? object.start : { x, y };
    const end =
      object.end.kind === "free" ? object.end : { x: x + width, y: y + height };
    return `<line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}" />`;
  }
  const base =
    object.type === "shape" && object.shape === "ellipse"
      ? `<ellipse cx="${x + width / 2}" cy="${y + height / 2}" rx="${width / 2}" ry="${height / 2}" fill="${escapeXml(fill)}" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}"${transform} />`
      : object.type === "shape" && object.shape === "diamond"
        ? `<polygon points="${x + width / 2},${y} ${x + width},${y + height / 2} ${x + width / 2},${y + height} ${x},${y + height / 2}" fill="${escapeXml(fill)}" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}"${transform} />`
        : `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${object.type === "shape" ? 10 : 4}" fill="${escapeXml(fill)}" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}"${transform} />`;
  const label =
    object.type === "shape" || object.type === "text"
      ? object.text
      : object.type === "document"
        ? object.title
        : object.type === "table"
          ? object.cells.flat().join(" · ")
          : "";
  if (!label) return base;
  const fontSize = Math.min(object.style.fontSize ?? 16, 28);
  return `${base}<text x="${x + 10}" y="${y + Math.min(height / 2 + fontSize / 3, 28)}" font-family="${escapeXml(object.style.fontFamily ?? "Inter, sans-serif")}" font-size="${fontSize}" fill="${escapeXml(object.style.textColor ?? "#18181b")}"${transform}>${escapeXml(label.slice(0, 120))}</text>`;
}

export async function renderTargetedCanvasCapture(input: {
  objects: CanvasObjectV2[];
  targetObjectIds: string[];
  focusObjects?: CanvasObjectV2[];
  label: "before" | "after";
}) {
  const targets = (input.focusObjects ?? input.objects).filter((object) =>
    input.targetObjectIds.includes(object.id),
  );
  if (!targets.length)
    throw new Error("A targeted capture requires an object.");
  const padding = 120;
  const bounds = targets.reduce(
    (result, object) => ({
      x: Math.min(result.x, object.geometry.x - padding),
      y: Math.min(result.y, object.geometry.y - padding),
      right: Math.max(
        result.right,
        object.geometry.x + object.geometry.width + padding,
      ),
      bottom: Math.max(
        result.bottom,
        object.geometry.y + object.geometry.height + padding,
      ),
    }),
    { x: Infinity, y: Infinity, right: -Infinity, bottom: -Infinity },
  );
  const context = input.objects.filter((object) => intersects(object, bounds));
  const sourceWidth = Math.max(1, bounds.right - bounds.x);
  const sourceHeight = Math.max(1, bounds.bottom - bounds.y);
  const scale = Math.min(1, 1024 / sourceWidth, 768 / sourceHeight);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${bounds.x} ${bounds.y} ${sourceWidth} ${sourceHeight}"><rect x="${bounds.x}" y="${bounds.y}" width="${sourceWidth}" height="${sourceHeight}" fill="#fafafa"/><text x="${bounds.x + 12}" y="${bounds.y + 24}" font-family="Inter, sans-serif" font-size="13" fill="#71717a">${input.label.toUpperCase()} · targeted review capture</text>${context.map(objectSvg).join("")}</svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return {
    dataUrl: `data:image/png;base64,${png.toString("base64")}`,
    width,
    height,
    targetObjectIds: input.targetObjectIds,
    contextObjectIds: context.map((object) => object.id),
  } satisfies TargetedCanvasCapture;
}
