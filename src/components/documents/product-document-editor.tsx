"use client";

import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { TablePlugin } from "@lexical/react/LexicalTablePlugin";
import { ChevronLeft, ChevronRight, Settings2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type * as Y from "yjs";

import { Button } from "@/components/ui/button";
import { ProductDocumentCollaboration } from "@/components/documents/product-document-collaboration";
import { ProductDocumentComments } from "@/components/documents/product-document-comments";
import {
  productDocumentLexicalNodes,
  productDocumentLexicalTheme,
} from "@/components/documents/product-document-lexical-config";
import { ProductDocumentToolbar } from "@/components/documents/product-document-toolbar";
import type { CanvasObjectV2 } from "@/canvas/canvas-document";
import {
  documentMarkdownTransformers,
  isSafeDocumentLink,
} from "@/documents/document-markdown";
import type { ProductDocumentObject } from "@/documents/product-document";
import {
  documentDisplayFonts,
  documentPageContentHeight,
  documentReadingMetrics,
  documentReadingSurfaceHeight,
  documentReadingSurfaceWidth,
} from "@/documents/document-presentation";
import type { DocumentSettings } from "@/documents/document-schema";
import type { DocumentRangeTarget } from "@/documents/document-range";
import type { CanvasRole } from "@/domain/command";

type Props = {
  canvasDocument: Y.Doc;
  canvasId: string;
  canvasRole: CanvasRole;
  supabaseUrl: string;
  supabasePublishableKey: string;
  documentObject: ProductDocumentObject;
  screenBounds: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  username: string;
  canEdit: boolean;
  canvasObjects: CanvasObjectV2[];
  onAiTransactionApplied: (changeSetId: string) => void;
  onUndoAiTransaction: (changeSetId: string) => Promise<{ conflicts: number }>;
  onUpdate: (update: { title?: string; settings?: DocumentSettings }) => void;
  onExit: () => void;
};

const backgroundOptions = [
  { label: "White", value: "#ffffff" },
  { label: "Warm", value: "#fffbeb" },
  { label: "Blue", value: "#eff6ff" },
  { label: "Green", value: "#ecfdf5" },
  { label: "Rose", value: "#fff1f2" },
] as const;

function layoutValue(settings: DocumentSettings) {
  if (settings.layout.mode === "continuous") return "continuous";
  return `${settings.layout.pageSize}-${settings.layout.orientation}`;
}

function parseLayout(value: string): DocumentSettings["layout"] {
  if (value === "continuous") return { mode: "continuous" };
  const [pageSize, orientation] = value.split("-");
  if (
    (pageSize === "letter" || pageSize === "a4") &&
    (orientation === "portrait" || orientation === "landscape")
  ) {
    return { mode: "paginated", pageSize, orientation };
  }
  throw new Error("Unsupported document layout.");
}

export function ProductDocumentEditor({
  canvasDocument,
  canvasId,
  canvasRole,
  supabaseUrl,
  supabasePublishableKey,
  documentObject,
  screenBounds,
  username,
  canEdit,
  canvasObjects,
  onAiTransactionApplied,
  onUndoAiTransaction,
  onUpdate,
  onExit,
}: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [selectedRange, setSelectedRange] =
    useState<DocumentRangeTarget | null>(null);
  const editorElementRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const readingSurfaceRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const settings = documentObject.settings;
  const reading = documentReadingMetrics[settings.readingSize];
  const pageHeight = documentPageContentHeight(settings);
  const surfaceHeight = documentReadingSurfaceHeight(settings);
  const surfaceWidth = documentReadingSurfaceWidth(settings);
  const surfaceScale = screenBounds.width / surfaceWidth;
  const handleRangeSelectionChange = useCallback(
    (range: DocumentRangeTarget | null) => setSelectedRange(range),
    [],
  );

  useEffect(() => {
    const input = titleInputRef.current;
    if (input && document.activeElement !== input) {
      input.value = documentObject.title;
    }
  }, [documentObject.title]);

  useEffect(() => {
    let settledFrame = 0;
    const frame = window.requestAnimationFrame(() => {
      const scrollContainer = scrollContainerRef.current;
      if (!scrollContainer) return;
      scrollContainer.scrollTop = 0;
      settledFrame = window.requestAnimationFrame(() => {
        if (scrollContainerRef.current)
          scrollContainerRef.current.scrollTop = 0;
      });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(settledFrame);
    };
  }, [documentObject.id]);

  function updateSettings(patch: Partial<DocumentSettings>) {
    onUpdate({ settings: { ...settings, ...patch } });
  }

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (settingsOpen) setSettingsOpen(false);
      else onExit();
    }
    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [onExit, settingsOpen]);

  useEffect(() => {
    if (pageHeight === null) return;
    const editorElement = editorElementRef.current;
    if (!editorElement) return;
    const measure = () => {
      const nextCount = Math.max(
        1,
        Math.ceil(editorElement.scrollHeight / pageHeight),
      );
      setPageCount(nextCount);
      setPageIndex((current) => Math.min(current, nextCount - 1));
    };
    measure();
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    const mutationObserver = new MutationObserver(measure);
    resizeObserver?.observe(editorElement);
    mutationObserver.observe(editorElement, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    return () => {
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
    };
  }, [pageHeight]);

  useEffect(() => {
    if (pageHeight === null) return;
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      const anchor = selection?.anchorNode;
      const editorElement = editorElementRef.current;
      const surface = readingSurfaceRef.current;
      if (!anchor || !editorElement?.contains(anchor) || !surface) return;
      const anchorElement =
        anchor.nodeType === Node.ELEMENT_NODE
          ? (anchor as Element)
          : anchor.parentElement;
      if (!anchorElement) return;
      const logicalTop =
        anchorElement.getBoundingClientRect().top -
        surface.getBoundingClientRect().top +
        pageIndex * pageHeight;
      setPageIndex(
        Math.max(
          0,
          Math.min(pageCount - 1, Math.floor(logicalTop / pageHeight)),
        ),
      );
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    return () =>
      document.removeEventListener("selectionchange", handleSelectionChange);
  }, [pageCount, pageHeight, pageIndex]);

  return (
    <div
      className="absolute z-20 overflow-visible text-zinc-950"
      data-testid="focused-product-document"
      style={screenBounds}
    >
      <div className="relative h-full overflow-visible">
        <LexicalComposer
          initialConfig={{
            namespace: `thinking-canvas-document-${documentObject.documentId}`,
            nodes: productDocumentLexicalNodes,
            editable: canEdit,
            editorState: null,
            theme: productDocumentLexicalTheme,
            onError(error) {
              throw error;
            },
          }}
        >
          <ProductDocumentToolbar
            title={documentObject.title}
            canEdit={canEdit}
            onTitleChange={(title) => onUpdate({ title })}
            documentControls={
              <>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  aria-label="Document settings"
                  title="Document settings"
                  aria-expanded={settingsOpen}
                  aria-controls="document-settings-panel"
                  onClick={() => setSettingsOpen((current) => !current)}
                >
                  <Settings2 aria-hidden="true" />
                </Button>
                <ProductDocumentComments
                  canvasDocument={canvasDocument}
                  canvasId={canvasId}
                  canvasRole={canvasRole}
                  documentObjectId={documentObject.id}
                  objects={canvasObjects}
                  selectedObjectIds={[]}
                  selectedRange={selectedRange}
                  supabaseUrl={supabaseUrl}
                  supabasePublishableKey={supabasePublishableKey}
                  onAiTransactionApplied={onAiTransactionApplied}
                  onUndoAiTransaction={onUndoAiTransaction}
                  compact
                />
              </>
            }
          />
          {pageHeight !== null ? (
            <nav
              aria-label="Document pages"
              className="absolute bottom-3 left-1/2 z-[60] flex -translate-x-1/2 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-zinc-900 p-1.5 text-white shadow-2xl [&_button]:border-transparent [&_button]:bg-transparent [&_button]:text-zinc-100 [&_button:hover]:bg-white/10"
            >
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label="Previous page"
                disabled={pageIndex === 0}
                onClick={() =>
                  setPageIndex((current) => Math.max(0, current - 1))
                }
              >
                <ChevronLeft aria-hidden="true" />
              </Button>
              <output
                className="min-w-20 text-center text-xs text-zinc-200"
                data-testid="document-page-status"
              >
                Page {pageIndex + 1} of {pageCount}
              </output>
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label="Next page"
                disabled={pageIndex >= pageCount - 1}
                onClick={() =>
                  setPageIndex((current) =>
                    Math.min(pageCount - 1, current + 1),
                  )
                }
              >
                <ChevronRight aria-hidden="true" />
              </Button>
            </nav>
          ) : null}
          <div
            ref={scrollContainerRef}
            role="region"
            tabIndex={0}
            className="h-full overflow-x-hidden overflow-y-auto rounded-[inherit]"
            aria-label={`${documentObject.title} document workspace`}
            data-testid="document-scroll-container"
          >
            <div
              ref={readingSurfaceRef}
              className={`relative mx-auto border border-zinc-200 pt-16 shadow-xl ${settings.layout.mode === "continuous" ? "min-h-full rounded-xl px-20 pb-24" : "overflow-hidden rounded-sm px-24 pb-24"}`}
              data-testid="document-reading-surface"
              data-layout-mode={settings.layout.mode}
              style={{
                width: surfaceWidth,
                minHeight: screenBounds.height / surfaceScale,
                ...(surfaceHeight === null
                  ? {}
                  : { height: Math.max(surfaceHeight, screenBounds.height) }),
                backgroundColor: settings.background,
                fontFamily: documentDisplayFonts[settings.displayFont],
                fontSize: reading.fontSize,
                lineHeight: reading.lineHeight,
                zoom: surfaceScale,
              }}
            >
              <label className="relative z-20 block">
                <span className="sr-only">Document title</span>
                <input
                  ref={titleInputRef}
                  defaultValue={documentObject.title}
                  readOnly={!canEdit}
                  maxLength={500}
                  className="mb-7 w-full border-0 bg-transparent p-0 text-4xl font-bold tracking-tight text-zinc-950 outline-none read-only:text-zinc-700 focus:ring-0"
                  onBlur={(event) => {
                    const next =
                      event.currentTarget.value.trim() || "Untitled document";
                    event.currentTarget.value = next;
                    if (next !== documentObject.title)
                      onUpdate({ title: next });
                  }}
                />
              </label>
              <RichTextPlugin
                contentEditable={
                  <ContentEditable
                    ref={editorElementRef}
                    aria-label="Document body"
                    className="relative z-20 min-h-[34rem] whitespace-pre-wrap transition-transform outline-none motion-reduce:transition-none"
                    data-testid="product-document-editor"
                    style={
                      pageHeight === null
                        ? undefined
                        : {
                            minHeight: pageHeight,
                            transform: `translateY(-${pageIndex * pageHeight}px)`,
                          }
                    }
                  />
                }
                placeholder={
                  <p className="pointer-events-none absolute top-56 left-20 text-zinc-400">
                    Start writing…
                  </p>
                }
                ErrorBoundary={LexicalErrorBoundary}
              />
              <ProductDocumentCollaboration
                canvasDocument={canvasDocument}
                documentId={documentObject.documentId}
                username={username}
                cursorColor="#7c3aed"
                documentObjectId={documentObject.id}
                onRangeSelectionChange={handleRangeSelectionChange}
              />
              <ListPlugin />
              <LinkPlugin
                validateUrl={isSafeDocumentLink}
                attributes={{
                  rel: "noopener noreferrer",
                  target: "_blank",
                }}
              />
              <TablePlugin
                hasCellMerge={false}
                hasCellBackgroundColor={false}
                hasHorizontalScroll
                hasNestedTables={false}
              />
              <MarkdownShortcutPlugin
                transformers={documentMarkdownTransformers}
              />
              {canEdit ? <AutoFocusPlugin /> : null}
            </div>
          </div>
        </LexicalComposer>

        {settingsOpen ? (
          <aside
            id="document-settings-panel"
            aria-label="Document settings"
            className="absolute top-16 right-3 z-[90] max-h-[calc(100%-5rem)] w-[min(22rem,calc(100%-1.5rem))] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">Document settings</h2>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setSettingsOpen(false)}
              >
                Done
              </Button>
            </div>
            <fieldset className="mt-5" disabled={!canEdit}>
              <legend className="text-sm font-medium">Background</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {backgroundOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-label={`${option.label} document background`}
                    aria-pressed={settings.background === option.value}
                    className="size-10 rounded-full border border-zinc-300 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-600 aria-pressed:ring-2 aria-pressed:ring-violet-600 aria-pressed:ring-offset-2"
                    style={{ backgroundColor: option.value }}
                    onClick={() => updateSettings({ background: option.value })}
                  />
                ))}
              </div>
            </fieldset>
            <label className="mt-5 block text-sm font-medium">
              Display font
              <select
                value={settings.displayFont}
                disabled={!canEdit}
                className="mt-2 h-11 w-full rounded-lg border border-zinc-300 bg-white px-3"
                onChange={(event) =>
                  updateSettings({
                    displayFont: event.target
                      .value as DocumentSettings["displayFont"],
                  })
                }
              >
                <option value="sans">Sans serif</option>
                <option value="serif">Serif</option>
                <option value="mono">Monospace</option>
              </select>
            </label>
            <label className="mt-5 block text-sm font-medium">
              Reading size
              <select
                value={settings.readingSize}
                disabled={!canEdit}
                className="mt-2 h-11 w-full rounded-lg border border-zinc-300 bg-white px-3"
                onChange={(event) =>
                  updateSettings({
                    readingSize: event.target
                      .value as DocumentSettings["readingSize"],
                  })
                }
              >
                <option value="compact">Compact</option>
                <option value="comfortable">Comfortable</option>
                <option value="large">Large</option>
              </select>
            </label>
            <label className="mt-5 block text-sm font-medium">
              Layout
              <select
                value={layoutValue(settings)}
                disabled={!canEdit}
                className="mt-2 h-11 w-full rounded-lg border border-zinc-300 bg-white px-3"
                onChange={(event) =>
                  updateSettings({ layout: parseLayout(event.target.value) })
                }
              >
                <option value="continuous">Continuous</option>
                <option value="letter-portrait">US Letter · portrait</option>
                <option value="letter-landscape">US Letter · landscape</option>
                <option value="a4-portrait">A4 · portrait</option>
                <option value="a4-landscape">A4 · landscape</option>
              </select>
            </label>
            <p className="mt-5 text-xs leading-5 text-zinc-500">
              Font, reading size, background, and page presentation affect only
              how the document appears. They are excluded from Markdown.
            </p>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
