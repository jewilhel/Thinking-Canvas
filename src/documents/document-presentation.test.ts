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
});
