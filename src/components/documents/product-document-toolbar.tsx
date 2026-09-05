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
import { $createTableNodeWithDimensions } from "@lexical/table";
import {
  $createParagraphNode,
  $createRangeSelection,
  $getRoot,
  $getSelection,
  $isElementNode,
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
  Check,
  Download,
  Italic,
  Link,
  List,
  ListOrdered,
  MessageCircle,
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
  canComment: boolean;
  commentsOpen: boolean;
  documentControls: ReactNode;
  onCommentsOpen: () => void;
  onSelectionPositionChange: (
    position: { left: number; top: number } | null,
  ) => void;
  onTitleChange: (title: string) => void;
};

type Action = "import" | "export";
type PressedState = boolean | "mixed";
type SelectionPointSnapshot = {
  key: string;
  offset: number;
  type: "element" | "text";
};
type RangeSelectionSnapshot = {
  anchor: SelectionPointSnapshot;
  focus: SelectionPointSnapshot;
};

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
  canComment,
  commentsOpen,
  documentControls,
  onCommentsOpen,
  onSelectionPositionChange,
  onTitleChange,
}: Props) {
  const [editor] = useLexicalComposerContext();
  const [bold, setBold] = useState<PressedState>(false);
  const [italic, setItalic] = useState<PressedState>(false);
  const [blockType, setBlockType] = useState("paragraph");
  const [status, setStatus] = useState("");
  const [activeAction, setActiveAction] = useState<Action | null>(null);
  const [linkEditorOpen, setLinkEditorOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [selectionPosition, setSelectionPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  const linkPalette = useRef<HTMLFormElement>(null);
  const linkSelection = useRef<RangeSelectionSnapshot | null>(null);
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

  useEffect(() => {
    if (linkEditorOpen) {
      window.requestAnimationFrame(() => linkInput.current?.focus());
    }
  }, [linkEditorOpen]);

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
      if (linkEditorOpen || commentsOpen) return;
      setSelectionPosition(null);
      onSelectionPositionChange(null);
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
      if (linkEditorOpen || commentsOpen) return;
      setSelectionPosition(null);
      onSelectionPositionChange(null);
      return;
    }
    const selectionRect = nativeSelection.getRangeAt(0).getBoundingClientRect();
    const frameRect = focusedFrame.getBoundingClientRect();
    const unclampedLeft =
      selectionRect.left + selectionRect.width / 2 - frameRect.left;
    const nextPosition = {
      left: Math.max(24, Math.min(frameRect.width - 24, unclampedLeft)),
      top: Math.max(-52, selectionRect.top - frameRect.top - 52),
    };
    setSelectionPosition(nextPosition);
    onSelectionPositionChange(nextPosition);
  }, [commentsOpen, editor, linkEditorOpen, onSelectionPositionChange]);

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

  function beginLink() {
    let selectionSnapshot: RangeSelectionSnapshot | null = null;
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection) && !selection.isCollapsed()) {
        selectionSnapshot = {
          anchor: {
            key: selection.anchor.key,
            offset: selection.anchor.offset,
            type: selection.anchor.type,
          },
          focus: {
            key: selection.focus.key,
            offset: selection.focus.offset,
            type: selection.focus.type,
          },
        };
      }
    });
    if (!selectionSnapshot) return;
    linkSelection.current = selectionSnapshot;
    setLinkUrl("");
    setStatus("");
    setLinkEditorOpen(true);
  }

  function applyLink() {
    const url = linkUrl.trim();
    const selectionSnapshot = linkSelection.current;
    if (!selectionSnapshot) {
      setLinkEditorOpen(false);
      return;
    }
    if (url !== "" && !isSafeDocumentLink(url)) {
      setStatus("Document links must use an http or https address.");
      window.requestAnimationFrame(() => linkInput.current?.focus());
      return;
    }
    // Clear the pinned selection before the form unmounts. Its input blur can
    // otherwise re-enter this handler while Lexical is applying the command.
    linkSelection.current = null;
    setLinkEditorOpen(false);
    editor.update(
      () => {
        const selection = $createRangeSelection();
        selection.anchor.set(
          selectionSnapshot.anchor.key,
          selectionSnapshot.anchor.offset,
          selectionSnapshot.anchor.type,
        );
        selection.focus.set(
          selectionSnapshot.focus.key,
          selectionSnapshot.focus.offset,
          selectionSnapshot.focus.type,
        );
        $setSelection(selection);
      },
      { discrete: true },
    );
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, url || null);
    window.requestAnimationFrame(() => editor.focus());
  }

  function insertTableAfterSelection() {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || selection.isCollapsed()) return;
      const selectedNodes = selection.getNodes();
      const lastSelectedNode = selectedNodes[selectedNodes.length - 1];
      if (!lastSelectedNode) return;
      const selectedBlock = lastSelectedNode.getTopLevelElementOrThrow();
      const table = $createTableNodeWithDimensions(3, 3, true);
      selectedBlock.insertAfter(table);
      const firstTableDescendant = table.getFirstDescendant();
      if ($isElementNode(firstTableDescendant)) {
        firstTableDescendant.selectStart();
      } else {
        table.selectStart();
      }
    });
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
            aria-expanded={linkEditorOpen}
            disabled={!canEdit}
            onClick={beginLink}
          >
            <Link aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label="Comment on selected text"
            aria-expanded={commentsOpen}
            disabled={!canComment}
            onClick={onCommentsOpen}
          >
            <MessageCircle aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label="Insert table"
            disabled={!canEdit}
            onClick={insertTableAfterSelection}
          >
            <Table2 aria-hidden="true" />
          </Button>
        </div>
      ) : null}

      {linkEditorOpen && selectionPosition ? (
        <form
          ref={linkPalette}
          role="dialog"
          aria-label="Add link"
          className="absolute z-[90] flex w-[min(26rem,calc(100%-1.5rem))] -translate-x-1/2 items-center gap-2 rounded-2xl border border-white/10 bg-zinc-900 p-2 text-white shadow-2xl"
          style={{
            left: selectionPosition.left,
            top: selectionPosition.top + 48,
          }}
          onSubmit={(event) => {
            event.preventDefault();
            applyLink();
          }}
        >
          <label className="min-w-0 flex-1">
            <span className="sr-only">Link URL</span>
            <input
              ref={linkInput}
              type="url"
              aria-label="Link URL"
              placeholder="Paste an https:// URL"
              value={linkUrl}
              className="h-9 w-full rounded-xl border border-white/15 bg-zinc-800 px-3 text-sm text-white outline-none placeholder:text-zinc-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/40"
              onChange={(event) => {
                setLinkUrl(event.currentTarget.value);
                setStatus("");
              }}
              onBlur={(event) => {
                const next = event.relatedTarget;
                if (next instanceof Node && linkPalette.current?.contains(next))
                  return;
                applyLink();
              }}
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                linkSelection.current = null;
                setLinkEditorOpen(false);
                editor.focus();
              }}
            />
          </label>
          <Button
            type="submit"
            size="icon-sm"
            variant="outline"
            aria-label="Apply link"
            className="border-white/15 bg-zinc-800 text-white hover:bg-zinc-700"
          >
            <Check aria-hidden="true" />
          </Button>
        </form>
      ) : null}
    </>
  );
}
