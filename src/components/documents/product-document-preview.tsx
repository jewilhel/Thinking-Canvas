"use client";

import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import type * as Y from "yjs";

import { ProductDocumentCollaboration } from "@/components/documents/product-document-collaboration";
import {
  productDocumentLexicalNodes,
  productDocumentLexicalTheme,
} from "@/components/documents/product-document-lexical-config";
import {
  documentDisplayFonts,
  documentPageContentHeight,
  documentReadingMetrics,
  documentReadingSurfaceHeight,
  documentReadingSurfaceWidth,
} from "@/documents/document-presentation";
import type { ProductDocumentObject } from "@/documents/product-document";

export function ProductDocumentPreview({
  canvasDocument,
  documentObject,
  screenBounds,
}: {
  canvasDocument: Y.Doc;
  documentObject: ProductDocumentObject;
  screenBounds: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}) {
  const settings = documentObject.settings;
  const reading = documentReadingMetrics[settings.readingSize];
  const surfaceWidth = documentReadingSurfaceWidth(settings);
  const surfaceHeight = documentReadingSurfaceHeight(settings);
  const pageHeight = documentPageContentHeight(settings);
  const surfaceScale = screenBounds.width / surfaceWidth;
  const logicalVisibleHeight = screenBounds.height / surfaceScale;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute overflow-hidden text-zinc-950 shadow-[0_22px_55px_rgba(15,23,42,0.22)]"
      data-testid={`document-page-preview-${documentObject.id}`}
      style={{
        ...screenBounds,
        transform: `rotate(${documentObject.geometry.rotation}deg)`,
        transformOrigin: "top left",
      }}
    >
      <LexicalComposer
        initialConfig={{
          namespace: `thinking-canvas-document-preview-${documentObject.documentId}`,
          nodes: productDocumentLexicalNodes,
          editable: false,
          editorState: null,
          theme: productDocumentLexicalTheme,
          onError(error) {
            throw error;
          },
        }}
      >
        <div className="h-full overflow-hidden rounded-[inherit]">
          <div
            className={`relative mx-auto border border-zinc-200 pt-16 shadow-xl ${settings.layout.mode === "continuous" ? "min-h-full rounded-xl px-20 pb-24" : "overflow-hidden rounded-sm px-24 pb-24"}`}
            data-testid="document-preview-reading-surface"
            style={{
              width: surfaceWidth,
              minHeight: logicalVisibleHeight,
              ...(surfaceHeight === null
                ? {}
                : { height: Math.max(surfaceHeight, logicalVisibleHeight) }),
              backgroundColor: settings.background,
              fontFamily: documentDisplayFonts[settings.displayFont],
              fontSize: reading.fontSize,
              lineHeight: reading.lineHeight,
              zoom: surfaceScale,
            }}
          >
            <div className="relative z-20 mb-7 w-full text-4xl font-bold tracking-tight text-zinc-950">
              {documentObject.title || "Untitled document"}
            </div>
            <RichTextPlugin
              contentEditable={
                <ContentEditable
                  className="relative z-20 min-h-[34rem] whitespace-pre-wrap outline-none"
                  data-testid="product-document-preview-body"
                  tabIndex={-1}
                  style={
                    pageHeight === null ? undefined : { minHeight: pageHeight }
                  }
                />
              }
              placeholder={null}
              ErrorBoundary={LexicalErrorBoundary}
            />
            <ProductDocumentCollaboration
              canvasDocument={canvasDocument}
              documentId={documentObject.documentId}
              username="Document preview"
              cursorColor="#7c3aed"
              documentObjectId={documentObject.id}
              preview
            />
          </div>
        </div>
      </LexicalComposer>
    </div>
  );
}
