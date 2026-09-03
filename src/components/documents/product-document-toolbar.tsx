"use client";

import { TOGGLE_LINK_COMMAND } from "@lexical/link";
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
} from "@lexical/list";
import {
  $convertSelectionToMarkdownString,
  $convertToMarkdownString,
  $generateNodesFromMarkdownString,
} from "@lexical/markdown";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createHeadingNode,
  $isHeadingNode,
  type HeadingTagType,
} from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import { INSERT_TABLE_COMMAND } from "@lexical/table";
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  FORMAT_TEXT_COMMAND,
  type BaseSelection,
} from "lexical";
import {
  Bold,
  ClipboardPaste,
  Copy,
  Download,
  Italic,
  Link,
  List,
  ListOrdered,
  Table2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  documentMarkdownFilename,
  documentMarkdownTransformers,
  decodeDocumentMarkdownFile,
  getDocumentMarkdownLosses,
  isSafeDocumentLink,
  markdownLossInventoryForSettings,
  maximumMarkdownBytes,
  validateDocumentMarkdown,
} from "@/documents/document-markdown";
import type { DocumentSettings } from "@/documents/document-schema";

type Props = {
  title: string;
  settings: DocumentSettings;
  canEdit: boolean;
};

type MarkdownPanel = "paste" | "import" | "export" | null;
type PressedState = boolean | "mixed";

function selectedFormatState(format: "bold" | "italic"): PressedState {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;
  const textNodes = selection.getNodes().filter($isTextNode);
  if (textNodes.length === 0) return selection.hasFormat(format);
  const matches = textNodes.filter((node) => node.hasFormat(format)).length;
  if (matches === 0) return false;
  if (matches === textNodes.length) return true;
  return "mixed";
}

function selectedBlockType() {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return "paragraph";
  const blocks = new Set(
    selection.getNodes().map((node) => {
      let block = node;
      while (block.getParent() && block.getParent()?.getType() !== "root") {
        block = block.getParent()!;
      }
      return $isHeadingNode(block) ? block.getTag() : block.getType();
    }),
  );
  return blocks.size === 1 ? [...blocks][0]! : "mixed";
}

async function copyText(value: string) {
  if (!navigator.clipboard?.writeText) {
    throw new Error("Clipboard access is unavailable in this browser.");
  }
  await navigator.clipboard.writeText(value);
}

export function ProductDocumentToolbar({ title, settings, canEdit }: Props) {
  const [editor] = useLexicalComposerContext();
  const [bold, setBold] = useState<PressedState>(false);
  const [italic, setItalic] = useState<PressedState>(false);
  const [blockType, setBlockType] = useState("paragraph");
  const [panel, setPanel] = useState<MarkdownPanel>(null);
  const [markdown, setMarkdown] = useState("");
  const [status, setStatus] = useState("");
  const savedSelection = useRef<BaseSelection | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refreshToolbar = useCallback(() => {
    editor.getEditorState().read(() => {
      setBold(selectedFormatState("bold"));
      setItalic(selectedFormatState("italic"));
      setBlockType(selectedBlockType());
    });
  }, [editor]);

  useEffect(() => {
    refreshToolbar();
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const nextBold = selectedFormatState("bold");
        const nextItalic = selectedFormatState("italic");
        const nextBlockType = selectedBlockType();
        window.setTimeout(() => {
          setBold(nextBold);
          setItalic(nextItalic);
          setBlockType(nextBlockType);
        });
      });
    });
  }, [editor, refreshToolbar]);

  function preserveSelection() {
    editor.getEditorState().read(() => {
      savedSelection.current = $getSelection()?.clone() ?? null;
    });
  }

  function openPanel(nextPanel: Exclude<MarkdownPanel, null>) {
    preserveSelection();
    setMarkdown("");
    setStatus("");
    setPanel(nextPanel);
  }

  function applyMarkdown(mode: "insert" | "replace") {
    try {
      const validated = validateDocumentMarkdown(markdown);
      window.setTimeout(() => {
        try {
          editor.update(
            () => {
              if (mode === "replace") {
                const nextNodes = $generateNodesFromMarkdownString(
                  validated,
                  documentMarkdownTransformers,
                );
                const root = $getRoot();
                const previousNodes = root.getChildren();
                $setSelection(null);
                root.append(
                  ...(nextNodes.length > 0
                    ? nextNodes
                    : [$createParagraphNode()]),
                );
                previousNodes.forEach((node) => node.remove());
              } else {
                if (savedSelection.current) {
                  $setSelection(savedSelection.current.clone());
                }
                const selection = $getSelection();
                if (!$isRangeSelection(selection)) {
                  throw new Error(
                    "Place the caret in the document before inserting Markdown.",
                  );
                }
                selection.insertNodes(
                  $generateNodesFromMarkdownString(
                    validated,
                    documentMarkdownTransformers,
                  ),
                );
              }
            },
            { discrete: true },
          );
          setPanel(null);
          setStatus(
            mode === "replace"
              ? "Replaced the document from Markdown."
              : "Inserted Markdown at the saved selection.",
          );
        } catch (error) {
          setStatus(
            error instanceof Error
              ? error.message
              : "Markdown could not be applied.",
          );
        }
      });
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Markdown could not be applied.",
      );
    }
  }

  async function handleCopy() {
    try {
      let scope = "complete document";
      let value = "";
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection) && !selection.isCollapsed()) {
          scope = "selection";
          value = $convertSelectionToMarkdownString(
            documentMarkdownTransformers,
            selection,
          ).trim();
        } else {
          value = $convertToMarkdownString(documentMarkdownTransformers);
        }
      });
      await copyText(value.replace(/\r\n?/g, "\n"));
      setStatus(
        `Copied the ${scope} as Markdown. Document display settings are excluded.`,
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Markdown could not be copied.",
      );
    }
  }

  function handleExport() {
    let value = "";
    editor.getEditorState().read(() => {
      value = $convertToMarkdownString(documentMarkdownTransformers).replace(
        /\r\n?/g,
        "\n",
      );
    });
    const blob = new Blob([value], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = documentMarkdownFilename(title);
    anchor.click();
    URL.revokeObjectURL(url);
    setPanel(null);
    setStatus(`Exported ${anchor.download}.`);
  }

  function setHeading(value: string) {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      $setBlocksType(selection, () =>
        value === "paragraph"
          ? $createParagraphNode()
          : $createHeadingNode(value as HeadingTagType),
      );
    });
  }

  function setLink() {
    const url = window.prompt("Enter an http or https link");
    if (url === null) return;
    if (url !== "" && !isSafeDocumentLink(url)) {
      setStatus("Document links must use an http or https address.");
      return;
    }
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, url || null);
  }

  const losses = getDocumentMarkdownLosses(
    markdownLossInventoryForSettings(settings),
  );

  return (
    <>
      <div
        role="toolbar"
        aria-label="Document formatting and Markdown"
        className="absolute top-16 left-1/2 z-[60] flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-2xl border border-white/10 bg-zinc-900 p-1.5 text-white shadow-2xl [&_button]:border-transparent [&_button]:bg-transparent [&_button]:text-zinc-100 [&_button:hover]:bg-white/10 [&_button[aria-pressed=true]]:bg-violet-600"
        onMouseDown={(event) => {
          if ((event.target as HTMLElement).closest("button"))
            event.preventDefault();
        }}
      >
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label="Bold"
          aria-pressed={bold}
          disabled={!canEdit}
          onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}
        >
          <Bold aria-hidden="true" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label="Italic"
          aria-pressed={italic}
          disabled={!canEdit}
          onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")}
        >
          <Italic aria-hidden="true" />
        </Button>
        <label>
          <span className="sr-only">Paragraph style</span>
          <select
            aria-label="Paragraph style"
            value={blockType === "mixed" ? "mixed" : blockType}
            disabled={!canEdit}
            className="h-8 rounded-md border border-white/10 bg-zinc-800 px-2 text-sm text-zinc-100"
            onMouseDown={(event) => event.stopPropagation()}
            onChange={(event) => setHeading(event.target.value)}
          >
            {blockType === "mixed" ? (
              <option value="mixed">Mixed styles</option>
            ) : null}
            <option value="paragraph">Paragraph</option>
            {Array.from({ length: 6 }, (_, index) => (
              <option key={index + 1} value={`h${index + 1}`}>
                Heading {index + 1}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label="Bulleted list"
          aria-pressed={blockType === "list"}
          disabled={!canEdit}
          onClick={() =>
            editor.dispatchCommand(
              blockType === "list"
                ? REMOVE_LIST_COMMAND
                : INSERT_UNORDERED_LIST_COMMAND,
              undefined,
            )
          }
        >
          <List aria-hidden="true" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label="Numbered list"
          disabled={!canEdit}
          onClick={() =>
            editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)
          }
        >
          <ListOrdered aria-hidden="true" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label="Add or remove link"
          disabled={!canEdit}
          onClick={setLink}
        >
          <Link aria-hidden="true" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label="Insert table"
          disabled={!canEdit}
          onClick={() =>
            editor.dispatchCommand(INSERT_TABLE_COMMAND, {
              columns: "3",
              rows: "3",
              includeHeaders: true,
            })
          }
        >
          <Table2 aria-hidden="true" />
        </Button>
        <span className="mx-1 h-6 w-px bg-white/20" aria-hidden="true" />
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          aria-label="Copy to Markdown"
          title="Copy to Markdown"
          onClick={handleCopy}
        >
          <Copy aria-hidden="true" />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          aria-label="Paste from Markdown"
          title="Paste from Markdown"
          disabled={!canEdit}
          onClick={() => openPanel("paste")}
        >
          <ClipboardPaste aria-hidden="true" />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          aria-label="Import Markdown"
          title="Import Markdown"
          disabled={!canEdit}
          onClick={() => fileInput.current?.click()}
        >
          <Upload aria-hidden="true" />
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".md,text/markdown,text/plain"
          className="sr-only"
          aria-label="Choose Markdown file"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            preserveSelection();
            if (file.size > maximumMarkdownBytes) {
              setStatus("Markdown must be 1 MB or smaller.");
              return;
            }
            try {
              setMarkdown(
                decodeDocumentMarkdownFile(await file.arrayBuffer(), file.name),
              );
              setPanel("import");
              setStatus("");
            } catch (error) {
              setStatus(
                error instanceof Error
                  ? error.message
                  : "Markdown could not be read.",
              );
            }
          }}
        />
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          aria-label="Export Markdown"
          title="Export Markdown"
          onClick={() => openPanel("export")}
        >
          <Download aria-hidden="true" />
        </Button>
        <p
          className="absolute top-full left-1/2 mt-2 max-w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl bg-zinc-900 px-3 py-2 text-center text-xs text-zinc-100 shadow-lg empty:hidden"
          aria-live="polite"
        >
          {status}
        </p>
      </div>

      {panel ? (
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="markdown-panel-title"
          className="absolute top-28 right-3 z-[90] w-[min(34rem,calc(100%-1.5rem))] rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl"
        >
          <h2 id="markdown-panel-title" className="font-semibold">
            {panel === "export"
              ? "Export Markdown"
              : panel === "import"
                ? "Import Markdown"
                : "Paste from Markdown"}
          </h2>
          {panel === "export" ? (
            <>
              <p className="mt-3 text-sm text-zinc-700">
                Markdown contains semantic text and tables only. The following
                content will not be exported:
              </p>
              <ul className="mt-2 list-disc pl-5 text-sm text-zinc-700">
                {losses.map((loss) => (
                  <li key={loss}>{loss}</li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-zinc-600">
                {panel === "import"
                  ? "Review the file, then insert it at the saved caret or replace the complete document."
                  : "Paste Markdown explicitly; ordinary clipboard paste remains unchanged."}
              </p>
              <textarea
                aria-label="Markdown source"
                value={markdown}
                autoFocus
                rows={12}
                className="mt-3 w-full resize-y rounded-lg border border-zinc-300 p-3 font-mono text-sm outline-none focus:ring-2 focus:ring-violet-500"
                onChange={(event) => setMarkdown(event.target.value)}
              />
            </>
          )}
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPanel(null)}
            >
              Cancel
            </Button>
            {panel !== "export" ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => applyMarkdown("insert")}
                >
                  Insert at selection
                </Button>
                <Button type="button" onClick={() => applyMarkdown("replace")}>
                  Replace document
                </Button>
              </>
            ) : (
              <Button type="button" onClick={handleExport}>
                Acknowledge and export
              </Button>
            )}
          </div>
          {status ? (
            <p className="mt-3 text-sm text-red-700" role="alert">
              {status}
            </p>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
