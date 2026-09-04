import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  documentDisplayFonts,
  documentLayoutLabel,
  documentPageContentHeight,
  documentPreviewText,
  documentReadingMetrics,
  documentReadingSurfaceHeight,
  documentReadingSurfaceWidth,
  focusedDocumentViewport,
} from "@/documents/document-presentation";
import { defaultDocumentSettings } from "@/documents/document-schema";

describe("document presentation", () => {
  it("resolves approved continuous and page presentation without semantic metadata", () => {
    expect(documentLayoutLabel(defaultDocumentSettings)).toBe("Continuous");
    expect(documentReadingSurfaceWidth(defaultDocumentSettings)).toBe(820);
    expect(
      documentLayoutLabel({
        ...defaultDocumentSettings,
        layout: { mode: "paginated", pageSize: "a4", orientation: "landscape" },
      }),
    ).toBe("A4 · landscape");
    expect(
      documentReadingSurfaceWidth({
        ...defaultDocumentSettings,
        layout: {
          mode: "paginated",
          pageSize: "letter",
          orientation: "landscape",
        },
      }),
    ).toBe(1056);
    expect(documentReadingSurfaceHeight(defaultDocumentSettings)).toBeNull();
    expect(
      documentReadingSurfaceHeight({
        ...defaultDocumentSettings,
        layout: {
          mode: "paginated",
          pageSize: "letter",
          orientation: "portrait",
        },
      }),
    ).toBe(1056);
    expect(
      documentReadingSurfaceHeight({
        ...defaultDocumentSettings,
        layout: {
          mode: "paginated",
          pageSize: "letter",
          orientation: "landscape",
        },
      }),
    ).toBe(816);
    expect(
      documentPageContentHeight({
        ...defaultDocumentSettings,
        layout: {
          mode: "paginated",
          pageSize: "a4",
          orientation: "portrait",
        },
      }),
    ).toBe(931);
    expect(
      ["letter", "a4"].flatMap((pageSize) =>
        ["portrait", "landscape"].map((orientation) => {
          const settings = {
            ...defaultDocumentSettings,
            layout: {
              mode: "paginated" as const,
              pageSize: pageSize as "letter" | "a4",
              orientation: orientation as "portrait" | "landscape",
            },
          };
          return [
            pageSize,
            orientation,
            documentReadingSurfaceWidth(settings),
            documentReadingSurfaceHeight(settings),
            documentPageContentHeight(settings),
          ];
        }),
      ),
    ).toEqual([
      ["letter", "portrait", 816, 1056, 864],
      ["letter", "landscape", 1056, 816, 624],
      ["a4", "portrait", 794, 1123, 931],
      ["a4", "landscape", 1123, 794, 602],
    ]);

    expect(Object.keys(documentDisplayFonts)).toEqual([
      "sans",
      "serif",
      "mono",
    ]);
    expect(Object.keys(documentReadingMetrics)).toEqual([
      "compact",
      "comfortable",
      "large",
    ]);
  });

  it("extracts and bounds plain preview text from structured shared content", () => {
    const document = new Y.Doc();
    const root = document.get("document", Y.XmlText) as Y.XmlText;
    const paragraph = new Y.XmlElement("paragraph");
    const text = new Y.XmlText();
    text.insert(0, "A collaborative document preview");
    paragraph.insert(0, [text]);
    root.insertEmbed(0, paragraph);

    expect(documentPreviewText(root)).toBe("A collaborative document preview");
    expect(documentPreviewText(root, 16)).toBe("A collaborative…");
  });

  it("fits and centers a focused document inside the usable canvas height", () => {
    const focus = focusedDocumentViewport({
      canvasWidth: 1440,
      canvasHeight: 900,
      geometry: { x: 120, y: 80, width: 480, height: 640 },
      minimumScale: 0.25,
      maximumScale: 4,
    });

    expect(focus.scale).toBeCloseTo(1.21875);
    expect(focus.screenBounds).toEqual({
      left: 427.5,
      top: 96,
      width: 585,
      height: 780,
    });
    expect(focus.x + 120 * focus.scale).toBe(focus.screenBounds.left);
    expect(focus.y + 80 * focus.scale).toBe(focus.screenBounds.top);
    expect(
      focus.screenBounds.top + focus.screenBounds.height,
    ).toBeLessThanOrEqual(900 - 24);
  });
});
