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
import { ArrowLeft, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import type * as Y from "yjs";

import { Button } from "@/components/ui/button";
import { ProductDocumentCollaboration } from "@/components/documents/product-document-collaboration";
import { ProductDocumentToolbar } from "@/components/documents/product-document-toolbar";
import {
  documentMarkdownTransformers,
  isSafeDocumentLink,
} from "@/documents/document-markdown";
import type { ProductDocumentObject } from "@/documents/product-document";
import {
  documentDisplayFonts,
  documentLayoutLabel,
  documentReadingMetrics,
  documentReadingSurfaceWidth,
} from "@/documents/document-presentation";
import type { DocumentSettings } from "@/documents/document-schema";

type Props = {
  canvasDocument: Y.Doc;
  documentObject: ProductDocumentObject;
  username: string;
  canEdit: boolean;
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
  onUpdate,
  onExit,
}: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settings = documentObject.settings;
  const reading = documentReadingMetrics[settings.readingSize];

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
          <div
            role="region"
            className="h-[calc(100%-3.25rem)] overflow-y-auto px-4 py-8 sm:px-8"
            aria-label={`${documentObject.title} document workspace`}
          >
            <div
              className={`relative mx-auto min-h-[calc(100vh-9rem)] border border-zinc-200 px-[clamp(2rem,8vw,6rem)] py-[clamp(2.5rem,8vw,6rem)] shadow-xl ${settings.layout.mode === "continuous" ? "rounded-xl" : "rounded-sm"}`}
              data-testid="document-reading-surface"
              data-layout-mode={settings.layout.mode}
              style={{
                width: `min(100%, ${documentReadingSurfaceWidth(settings)}px)`,
                backgroundColor: settings.background,
                fontFamily: documentDisplayFonts[settings.displayFont],
                fontSize: reading.fontSize,
                lineHeight: reading.lineHeight,
              }}
            >
              <RichTextPlugin
                contentEditable={
                  <ContentEditable
                    aria-label="Document body"
                    className="min-h-[60vh] whitespace-pre-wrap outline-none"
                    data-testid="product-document-editor"
                  />
                }
                placeholder={
                  <p className="pointer-events-none absolute top-[clamp(2.5rem,8vw,6rem)] left-[clamp(2rem,8vw,6rem)] text-zinc-400">
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
