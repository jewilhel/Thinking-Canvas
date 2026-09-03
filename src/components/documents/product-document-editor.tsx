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
import { LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import { HeadingNode } from "@lexical/rich-text";
import { TableCellNode, TableNode, TableRowNode } from "@lexical/table";
import { ArrowLeft, ChevronLeft, ChevronRight, Settings2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type * as Y from "yjs";

import { Button } from "@/components/ui/button";
import { ProductDocumentCollaboration } from "@/components/documents/product-document-collaboration";
import { ProductDocumentToolbar } from "@/components/documents/product-document-toolbar";
import { ProductDocumentObjectLayer } from "@/components/documents/product-document-object-layer";
import type { CanvasGroupV2, CanvasObjectV2 } from "@/canvas/canvas-document";
import type { PhosphorIconCatalog } from "@/canvas/phosphor-icon-catalog";
import {
  documentMarkdownTransformers,
  isSafeDocumentLink,
} from "@/documents/document-markdown";
import type { ProductDocumentObject } from "@/documents/product-document";
import {
  documentDisplayFonts,
  documentLayoutLabel,
  documentPageContentHeight,
  documentReadingMetrics,
  documentReadingSurfaceHeight,
  documentReadingSurfaceWidth,
} from "@/documents/document-presentation";
import type { DocumentSettings } from "@/documents/document-schema";

type Props = {
  canvasDocument: Y.Doc;
  documentObject: ProductDocumentObject;
  username: string;
  canEdit: boolean;
  canvasObjects: CanvasObjectV2[];
  canvasGroups: CanvasGroupV2[];
  showTemporaryAnnotations: boolean;
  iconCatalog: PhosphorIconCatalog | null;
  onMoveObject: (objectId: string, x: number, y: number) => void;
  onMoveGroup: (groupId: string, deltaX: number, deltaY: number) => void;
  onRemoveObject: (objectIds: string[]) => void;
  onDeleteObject: (objectIds: string[]) => void;
  onDuplicateObjects: (objectIds: string[]) => void;
  onCopyObjects: (objectIds: string[]) => void;
  onCutObjects: (objectIds: string[]) => void;
  onReorderObjects: (
    objectIds: string[],
    direction: "front" | "forward" | "backward" | "back",
  ) => void;
  onGroupObjects: (objectIds: string[]) => void;
  onUngroupObjects: (objectIds: string[]) => void;
  onObjectSelectionChange: (objectIds: string[]) => void;
  onUndoObjectChange: () => void;
  onRedoObjectChange: () => void;
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
  documentObject,
  username,
  canEdit,
  canvasObjects,
  canvasGroups,
  showTemporaryAnnotations,
  iconCatalog,
  onMoveObject,
  onMoveGroup,
  onRemoveObject,
  onDeleteObject,
  onDuplicateObjects,
  onCopyObjects,
  onCutObjects,
  onReorderObjects,
  onGroupObjects,
  onUngroupObjects,
  onObjectSelectionChange,
  onUndoObjectChange,
  onRedoObjectChange,
  onUpdate,
  onExit,
}: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const editorElementRef = useRef<HTMLDivElement>(null);
  const readingSurfaceRef = useRef<HTMLDivElement>(null);
  const settings = documentObject.settings;
  const reading = documentReadingMetrics[settings.readingSize];
  const pageHeight = documentPageContentHeight(settings);
  const surfaceHeight = documentReadingSurfaceHeight(settings);

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
      className="absolute inset-0 z-70 flex flex-col overflow-hidden bg-zinc-100 text-zinc-950"
      data-testid="focused-product-document"
    >
      <header className="relative z-10 flex min-h-16 flex-wrap items-center gap-3 border-b border-zinc-200 bg-white/95 px-4 py-2 shadow-sm backdrop-blur">
        <Button
          type="button"
          variant="outline"
          className="h-11 border-zinc-300 bg-white"
          onClick={onExit}
        >
          <ArrowLeft aria-hidden="true" /> Return to canvas
        </Button>
        <label className="min-w-48 flex-1">
          <span className="sr-only">Document title</span>
          <input
            key={documentObject.title}
            defaultValue={documentObject.title}
            readOnly={!canEdit}
            maxLength={500}
            className="h-11 w-full rounded-lg border border-transparent bg-transparent px-3 text-lg font-semibold outline-none read-only:text-zinc-600 hover:border-zinc-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
            onBlur={(event) => {
              const next =
                event.currentTarget.value.trim() || "Untitled document";
              event.currentTarget.value = next;
              if (next !== documentObject.title) onUpdate({ title: next });
            }}
          />
        </label>
        <span
          className="text-xs text-zinc-500"
          data-testid="document-layout-label"
        >
          {documentLayoutLabel(settings)}
        </span>
        <Button
          type="button"
          variant="outline"
          className="h-11 border-zinc-300 bg-white"
          aria-expanded={settingsOpen}
          aria-controls="document-settings-panel"
          onClick={() => setSettingsOpen((current) => !current)}
        >
          <Settings2 aria-hidden="true" /> Document settings
        </Button>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <LexicalComposer
          initialConfig={{
            namespace: `thinking-canvas-document-${documentObject.documentId}`,
            nodes: [
              HeadingNode,
              LinkNode,
              ListItemNode,
              ListNode,
              TableCellNode,
              TableNode,
              TableRowNode,
            ],
            editable: canEdit,
            editorState: null,
            theme: {
              heading: {
                h1: "mb-4 mt-8 text-4xl font-bold",
                h2: "mb-3 mt-7 text-3xl font-bold",
                h3: "mb-3 mt-6 text-2xl font-semibold",
                h4: "mb-2 mt-5 text-xl font-semibold",
                h5: "mb-2 mt-4 text-lg font-semibold",
                h6: "mb-2 mt-4 text-base font-semibold",
              },
              link: "text-violet-700 underline underline-offset-2",
              list: {
                listitem: "ml-6",
                nested: { listitem: "list-none" },
                ol: "my-3 list-decimal",
                ul: "my-3 list-disc",
              },
              paragraph: "my-2",
              table: "my-4 w-full border-collapse",
              tableScrollableWrapper: "max-w-full overflow-x-auto",
              tableCell: "min-w-24 border border-zinc-300 p-2 align-top",
              tableCellHeader:
                "min-w-24 border border-zinc-300 bg-zinc-100 p-2 text-left font-semibold align-top",
              tableRow: "border-b border-zinc-300",
              text: {
                bold: "font-bold",
                italic: "italic",
              },
            },
            onError(error) {
              throw error;
            },
          }}
        >
          <ProductDocumentToolbar
            title={documentObject.title}
            settings={settings}
            canEdit={canEdit}
          />
          {pageHeight !== null ? (
            <nav
              aria-label="Document pages"
              className="relative z-10 flex h-11 items-center justify-center gap-3 border-b border-zinc-200 bg-zinc-50 px-4"
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
                className="min-w-24 text-center text-sm"
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
            role="region"
            tabIndex={0}
            className={`${pageHeight === null ? "h-[calc(100%-3.25rem)]" : "h-[calc(100%-6rem)]"} overflow-y-auto px-4 py-8 sm:px-8`}
            aria-label={`${documentObject.title} document workspace`}
          >
            <div
              ref={readingSurfaceRef}
              className={`relative mx-auto border border-zinc-200 shadow-xl ${settings.layout.mode === "continuous" ? "min-h-[calc(100vh-9rem)] rounded-xl px-[clamp(2rem,8vw,6rem)] py-[clamp(2.5rem,8vw,6rem)]" : "overflow-hidden rounded-sm px-24 py-24"}`}
              data-testid="document-reading-surface"
              data-layout-mode={settings.layout.mode}
              style={{
                width: `min(100%, ${documentReadingSurfaceWidth(settings)}px)`,
                ...(surfaceHeight === null ? {} : { height: surfaceHeight }),
                backgroundColor: settings.background,
                fontFamily: documentDisplayFonts[settings.displayFont],
                fontSize: reading.fontSize,
                lineHeight: reading.lineHeight,
              }}
            >
              <RichTextPlugin
                contentEditable={
                  <ContentEditable
                    ref={editorElementRef}
                    aria-label="Document body"
                    className="min-h-[60vh] whitespace-pre-wrap transition-transform outline-none motion-reduce:transition-none"
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
                  <p className="pointer-events-none absolute top-[clamp(2.5rem,8vw,6rem)] left-[clamp(2rem,8vw,6rem)] text-zinc-400">
                    Start writing…
                  </p>
                }
                ErrorBoundary={LexicalErrorBoundary}
              />
              <ProductDocumentObjectLayer
                documentObject={documentObject}
                objects={canvasObjects}
                groups={canvasGroups}
                pageIndex={pageIndex}
                pageHeight={pageHeight}
                canEdit={canEdit}
                showTemporaryAnnotations={showTemporaryAnnotations}
                iconCatalog={iconCatalog}
                onMove={onMoveObject}
                onMoveGroup={onMoveGroup}
                onRemove={onRemoveObject}
                onDelete={onDeleteObject}
                onDuplicate={onDuplicateObjects}
                onCopy={onCopyObjects}
                onCut={onCutObjects}
                onReorder={onReorderObjects}
                onGroup={onGroupObjects}
                onUngroup={onUngroupObjects}
                onSelectionChange={onObjectSelectionChange}
                onUndo={onUndoObjectChange}
                onRedo={onRedoObjectChange}
              />
              <ProductDocumentCollaboration
                canvasDocument={canvasDocument}
                documentId={documentObject.documentId}
                username={username}
                cursorColor="#7c3aed"
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
            className="absolute top-4 right-4 z-20 max-h-[calc(100%-2rem)] w-[min(22rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xl"
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
