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
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  COPY_COMMAND,
  FORMAT_TEXT_COMMAND,
  PASTE_COMMAND,
  SELECTION_CHANGE_COMMAND,
  mergeRegister,
} from "lexical";
import {
  Bold,
  Download,
  Italic,
  Link,
  List,
  ListOrdered,
  Table2,
  Upload,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import {
  documentMarkdownFilename,
  documentTitleFromMarkdownFilename,
  documentMarkdownTransformers,
  decodeDocumentMarkdownFile,
  isSafeDocumentLink,
  looksLikeDocumentMarkdown,
  maximumMarkdownBytes,
  validateDocumentMarkdown,
} from "@/documents/document-markdown";
type Props = {
  title: string;
  canEdit: boolean;
  documentControls: ReactNode;
  onTitleChange: (title: string) => void;
};

type Action = "import" | "export";
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

export function ProductDocumentToolbar({
  title,
  canEdit,
  documentControls,
  onTitleChange,
}: Props) {
  const [editor] = useLexicalComposerContext();
  const [bold, setBold] = useState<PressedState>(false);
  const [italic, setItalic] = useState<PressedState>(false);
  const [blockType, setBlockType] = useState("paragraph");
  const [status, setStatus] = useState("");
  const [activeAction, setActiveAction] = useState<Action | null>(null);
  const [selectionPosition, setSelectionPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const actionTimer = useRef<number | null>(null);

  const flashAction = useCallback((action: Action) => {
    if (actionTimer.current !== null) window.clearTimeout(actionTimer.current);
    setActiveAction(action);
    actionTimer.current = window.setTimeout(() => {
      setActiveAction(null);
      actionTimer.current = null;
    }, 650);
  }, []);

  useEffect(
    () => () => {
      if (actionTimer.current !== null)
        window.clearTimeout(actionTimer.current);
    },
    [],
  );

  const refreshToolbar = useCallback(() => {
    let hasExpandedRange = false;
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      hasExpandedRange =
        $isRangeSelection(selection) && !selection.isCollapsed();
      setBold(selectedFormatState("bold"));
      setItalic(selectedFormatState("italic"));
      setBlockType(selectedBlockType());
    });
    if (!hasExpandedRange) {
      setSelectionPosition(null);
      return;
    }
    const editorRoot = editor.getRootElement();
    const focusedFrame = editorRoot?.closest<HTMLElement>(
      '[data-testid="focused-product-document"]',
    );
    const nativeSelection = window.getSelection();
    if (
      !editorRoot ||
      !focusedFrame ||
      !nativeSelection ||
      nativeSelection.isCollapsed ||
      nativeSelection.rangeCount === 0 ||
      !nativeSelection.anchorNode ||
      !editorRoot.contains(nativeSelection.anchorNode)
    ) {
      setSelectionPosition(null);
      return;
    }
    const selectionRect = nativeSelection.getRangeAt(0).getBoundingClientRect();
    const frameRect = focusedFrame.getBoundingClientRect();
    const unclampedLeft =
      selectionRect.left + selectionRect.width / 2 - frameRect.left;
    setSelectionPosition({
      left: Math.max(24, Math.min(frameRect.width - 24, unclampedLeft)),
      top: Math.max(-52, selectionRect.top - frameRect.top - 52),
    });
  }, [editor]);

  useEffect(() => {
    let frame = window.requestAnimationFrame(refreshToolbar);
    const scheduleRefresh = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(refreshToolbar);
    };
    const removeListeners = mergeRegister(
      editor.registerUpdateListener(scheduleRefresh),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          scheduleRefresh();
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
    return () => {
      window.cancelAnimationFrame(frame);
      removeListeners();
    };
  }, [editor, refreshToolbar]);

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        COPY_COMMAND,
        (event) => {
          if (!(event instanceof ClipboardEvent) || !event.clipboardData) {
            return false;
          }
          const selection = $getSelection();
          if (!$isRangeSelection(selection) || selection.isCollapsed()) {
            return false;
          }
          const value = $convertSelectionToMarkdownString(
            documentMarkdownTransformers,
            selection,
          )
            .trim()
            .replace(/\r\n?/g, "\n");
          event.preventDefault();
          event.clipboardData.setData("text/plain", value);
          event.clipboardData.setData("text/markdown", value);
          setStatus("Copied the selection as Markdown.");
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        PASTE_COMMAND,
        (event) => {
          if (!canEdit || !(event instanceof ClipboardEvent)) return false;
          const source = event.clipboardData?.getData("text/plain") ?? "";
          const isExplicitMarkdown =
            event.clipboardData?.types.includes("text/markdown");
          if (
            !source ||
            (!isExplicitMarkdown && !looksLikeDocumentMarkdown(source))
          ) {
            return false;
          }
          event.preventDefault();
          try {
            const validated = validateDocumentMarkdown(source);
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) return true;
            selection.insertNodes(
              $generateNodesFromMarkdownString(
                validated,
                documentMarkdownTransformers,
              ),
            );
            setStatus("Pasted Markdown at the cursor.");
          } catch (error) {
            setStatus(
              error instanceof Error
                ? error.message
                : "Markdown could not be pasted.",
            );
          }
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    );
  }, [canEdit, editor]);

  function replaceFromMarkdown(source: string, onSuccess: () => void) {
    try {
      const validated = validateDocumentMarkdown(source);
      window.setTimeout(() => {
        try {
          editor.update(
            () => {
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
            },
            { discrete: true },
          );
          onSuccess();
          setStatus("Imported Markdown.");
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
    flashAction("export");
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

  return (
    <>
      <div
        role="toolbar"
        aria-label="Document controls"
        className="absolute bottom-full left-1/2 z-[80] mb-3 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center justify-center gap-1 rounded-2xl border border-white/10 bg-zinc-900 p-1.5 text-white shadow-2xl [&_button]:border-transparent [&_button]:bg-transparent [&_button]:text-zinc-100 [&_button:hover]:bg-white/10 [&_button[aria-expanded=true]]:bg-violet-600 [&_button[aria-pressed=true]]:bg-violet-600"
        onMouseDown={(event) => {
          if ((event.target as HTMLElement).closest("button"))
            event.preventDefault();
        }}
      >
        {documentControls}
        <span className="mx-1 h-6 w-px bg-white/20" aria-hidden="true" />
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          aria-label="Import Markdown"
          title="Import Markdown"
          aria-pressed={activeAction === "import"}
          disabled={!canEdit}
          onClick={() => {
            flashAction("import");
            fileInput.current?.click();
          }}
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
            if (file.size > maximumMarkdownBytes) {
              setStatus("Markdown must be 1 MB or smaller.");
              return;
            }
            try {
              const source = decodeDocumentMarkdownFile(
                await file.arrayBuffer(),
                file.name,
              );
              replaceFromMarkdown(source, () => {
                onTitleChange(documentTitleFromMarkdownFilename(file.name));
                flashAction("import");
              });
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
          aria-pressed={activeAction === "export"}
          onClick={() => {
            setStatus("");
            handleExport();
          }}
        >
          <Download aria-hidden="true" />
        </Button>
        <p className="sr-only" aria-live="polite">
          {status}
        </p>
      </div>

      {selectionPosition ? (
        <div
          role="toolbar"
          aria-label="Text formatting"
          className="absolute z-[70] flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center justify-center gap-1 rounded-2xl border border-white/10 bg-zinc-900 p-1.5 text-white shadow-2xl [&_button]:border-transparent [&_button]:bg-transparent [&_button]:text-zinc-100 [&_button:hover]:bg-white/10 [&_button[aria-pressed=true]]:bg-violet-600"
          style={selectionPosition}
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
            onClick={() =>
              editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")
            }
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
        </div>
      ) : null}
    </>
  );
}
