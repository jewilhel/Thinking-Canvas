"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getAnchorAndFocusForUserState,
  createUndoManager,
  createYjsBinding,
  initLocalState,
  setLocalStateFocus,
  syncCursorPositions,
  syncLexicalUpdateToYjs,
  syncYjsChangesToLexical,
} from "@lexical/yjs";
import { createDOMRange } from "@lexical/selection";
import {
  $createParagraphNode,
  $getNodeByKey,
  $getRoot,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COLLABORATION_TAG,
  COMMAND_PRIORITY_EDITOR,
  mergeRegister,
  REDO_COMMAND,
  UNDO_COMMAND,
  $getSelection,
  $isRangeSelection,
} from "lexical";
import { useEffect, useRef } from "react";
import type { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";

import { CanvasLexicalProvider } from "@/documents/canvas-lexical-provider";
import type { CommentThread } from "@/comments/comment-model";
import { documentContentRootName } from "@/documents/document-schema";
import {
  boundedDocumentRangeQuote,
  decodeDocumentRelativePosition,
  encodeDocumentRelativePosition,
  type DocumentRangeTarget,
} from "@/documents/document-range";

type CachedCollabSharedType = object & {
  _collabNode?: unknown;
};

function nestedSharedTypes(sharedType: object) {
  if (sharedType instanceof Y.XmlText || sharedType instanceof Y.Text) {
    return sharedType
      .toDelta()
      .map((operation: { insert?: unknown }) => operation.insert)
      .filter(
        (insert: unknown): insert is object => insert instanceof Y.AbstractType,
      );
  }
  if (sharedType instanceof Y.Map) {
    return [...sharedType.values()].filter(
      (value): value is object => value instanceof Y.AbstractType,
    );
  }
  if (sharedType instanceof Y.Array || sharedType instanceof Y.XmlFragment) {
    return sharedType
      .toArray()
      .filter((value): value is object => value instanceof Y.AbstractType);
  }
  return [];
}

/**
 * Lexical caches its collaboration wrapper directly on each Yjs shared type.
 * Those wrappers retain their child arrays after destroy(), so reusing them on
 * a later editor mount appends the same tree again and can persist a doubled
 * document. A focused document has the only local binding for this namespace;
 * release that cache after the binding is fully disconnected.
 */
export function releaseDocumentCollabNodeCache(sharedType: object) {
  for (const child of nestedSharedTypes(sharedType)) {
    releaseDocumentCollabNodeCache(child);
  }
  delete (sharedType as CachedCollabSharedType)._collabNode;
}

export function ProductDocumentCollaboration({
  canvasDocument,
  documentId,
  username,
  cursorColor,
  documentObjectId,
  onRangeSelectionChange,
  commentThreads = [],
  preview = false,
}: {
  canvasDocument: Y.Doc;
  documentId: string;
  username: string;
  cursorColor: string;
  documentObjectId: string;
  onRangeSelectionChange?: (range: DocumentRangeTarget | null) => void;
  commentThreads?: CommentThread[];
  preview?: boolean;
}) {
  const [editor] = useLexicalComposerContext();
  const commentThreadsRef = useRef(commentThreads);
  const syncCommentHighlightsRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    commentThreadsRef.current = commentThreads;
    syncCommentHighlightsRef.current();
  }, [commentThreads]);

  useEffect(() => {
    const provider = new CanvasLexicalProvider(canvasDocument, documentId);
    const documentMap = new Map([[documentId, canvasDocument]]);
    const awareness = provider.awareness as unknown as Awareness;
    const binding = createYjsBinding({
      editor,
      id: documentId,
      doc: canvasDocument,
      docMap: documentMap,
      rootName: documentContentRootName(documentId),
    });
    const sharedRoot = binding.root.getSharedType();
    const highlightName = `document-comment-${documentObjectId}`;
    const rootElement = editor.getRootElement();
    const ownerDocument = rootElement?.ownerDocument;
    const highlightStyle = preview
      ? null
      : (ownerDocument?.createElement("style") ?? null);
    if (highlightStyle) {
      highlightStyle.dataset.documentCommentHighlight = documentObjectId;
      highlightStyle.textContent = `::highlight(${highlightName}) { background-color: color-mix(in srgb, #8b5cf6 28%, transparent); color: inherit; }`;
      ownerDocument?.head.append(highlightStyle);
    }
    let highlightFrame = 0;

    const clearCommentHighlights = () => {
      if (typeof CSS === "undefined") return;
      const registry = CSS.highlights;
      registry?.delete(highlightName);
    };
    const syncCommentHighlights = () => {
      if (preview) return;
      window.cancelAnimationFrame(highlightFrame);
      highlightFrame = window.requestAnimationFrame(() => {
        if (typeof Highlight === "undefined" || !CSS.highlights) return;
        const ranges = editor.getEditorState().read(() =>
          commentThreadsRef.current.flatMap((thread) => {
            if (
              thread.status !== "open" ||
              thread.documentRange?.documentObjectId !== documentObjectId
            ) {
              return [];
            }
            try {
              const { anchorKey, anchorOffset, focusKey, focusOffset } =
                $getAnchorAndFocusForUserState(binding, {
                  anchorPos: decodeDocumentRelativePosition(
                    thread.documentRange.anchor,
                  ),
                  focusPos: decodeDocumentRelativePosition(
                    thread.documentRange.head,
                  ),
                  color: "#8b5cf6",
                  focusing: false,
                  name: thread.authorName,
                  awarenessData: {},
                });
              if (!anchorKey || !focusKey) return [];
              const anchorNode = $getNodeByKey(anchorKey);
              const focusNode = $getNodeByKey(focusKey);
              if (!anchorNode || !focusNode) return [];
              const range = createDOMRange(
                editor,
                anchorNode,
                anchorOffset,
                focusNode,
                focusOffset,
              );
              return range && !range.collapsed ? [range] : [];
            } catch {
              return [];
            }
          }),
        );
        clearCommentHighlights();
        if (ranges.length > 0) {
          CSS.highlights.set(highlightName, new Highlight(...ranges));
        }
      });
    };
    syncCommentHighlightsRef.current = syncCommentHighlights;

    editor.update(
      () => {
        const lexicalRoot = $getRoot();
        lexicalRoot.clear();
        binding.root.syncPropertiesFromYjs(binding, null);
        binding.root.applyChildrenYjsDelta(binding, sharedRoot.toDelta());
        binding.root.syncChildrenFromYjs(binding);
        if (lexicalRoot.isEmpty()) lexicalRoot.append($createParagraphNode());
      },
      { discrete: true, skipTransforms: true, tag: COLLABORATION_TAG },
    );

    const observeSharedRoot = (
      events: Y.YEvent<Y.AbstractType<unknown>>[],
      transaction: Y.Transaction,
    ) => {
      if (transaction.origin === binding) return;
      syncYjsChangesToLexical(
        binding,
        provider,
        events as Y.YEvent<Y.Text>[],
        transaction.origin instanceof Y.UndoManager,
      );
    };
    sharedRoot.observeDeep(observeSharedRoot);

    if (preview) {
      return () => {
        window.cancelAnimationFrame(highlightFrame);
        clearCommentHighlights();
        highlightStyle?.remove();
        syncCommentHighlightsRef.current = () => undefined;
        sharedRoot.unobserveDeep(observeSharedRoot);
        binding.root.destroy(binding);
        releaseDocumentCollabNodeCache(sharedRoot);
      };
    }

    const undoManager = createUndoManager(binding, sharedRoot);
    const cursorContainer = document.createElement("div");
    let lastPublishedRangeKey: string | null = null;
    cursorContainer.dataset.lexicalDocumentCursors = documentId;
    document.body.append(cursorContainer);
    binding.cursorsContainer = cursorContainer;
    const removeEditorListener = editor.registerUpdateListener(
      ({
        prevEditorState,
        editorState,
        dirtyElements,
        dirtyLeaves,
        normalizedNodes,
        tags,
      }) => {
        syncLexicalUpdateToYjs(
          binding,
          provider,
          prevEditorState,
          editorState,
          dirtyElements,
          dirtyLeaves,
          normalizedNodes,
          tags,
        );
        const localState = provider.awareness.getLocalState();
        editorState.read(() => {
          const selection = $getSelection();
          if (
            !$isRangeSelection(selection) ||
            selection.isCollapsed() ||
            !localState?.anchorPos ||
            !localState.focusPos
          ) {
            if (lastPublishedRangeKey !== null) {
              lastPublishedRangeKey = null;
              onRangeSelectionChange?.(null);
            }
            return;
          }
          const quote = boundedDocumentRangeQuote(selection.getTextContent());
          if (!quote) {
            if (lastPublishedRangeKey !== null) {
              lastPublishedRangeKey = null;
              onRangeSelectionChange?.(null);
            }
            return;
          }
          const range = {
            documentObjectId,
            anchor: encodeDocumentRelativePosition(localState.anchorPos),
            head: encodeDocumentRelativePosition(localState.focusPos),
            quote,
          };
          const rangeKey = JSON.stringify(range);
          if (rangeKey === lastPublishedRangeKey) return;
          lastPublishedRangeKey = rangeKey;
          onRangeSelectionChange?.(range);
        });
        syncCommentHighlights();
      },
    );
    syncCommentHighlights();

    const updateHistoryState = () => {
      queueMicrotask(() => {
        editor.dispatchCommand(
          CAN_UNDO_COMMAND,
          undoManager.undoStack.length > 0,
        );
        editor.dispatchCommand(
          CAN_REDO_COMMAND,
          undoManager.redoStack.length > 0,
        );
      });
    };
    undoManager.on("stack-item-added", updateHistoryState);
    undoManager.on("stack-item-popped", updateHistoryState);
    undoManager.on("stack-cleared", updateHistoryState);
    const removeCommands = mergeRegister(
      editor.registerCommand(
        UNDO_COMMAND,
        () => {
          undoManager.undo();
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand(
        REDO_COMMAND,
        () => {
          undoManager.redo();
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
    );
    const removeFocusListeners = editor.registerRootListener(
      (rootElement, previousRootElement) => {
        const focus = () =>
          setLocalStateFocus(provider, username, cursorColor, true, {});
        const blur = () =>
          setLocalStateFocus(provider, username, cursorColor, false, {});
        previousRootElement?.removeEventListener("focus", focus);
        previousRootElement?.removeEventListener("blur", blur);
        rootElement?.addEventListener("focus", focus);
        rootElement?.addEventListener("blur", blur);
      },
    );
    const handleAwarenessUpdate = ({
      added,
      updated,
      removed,
    }: {
      added: number[];
      updated: number[];
      removed: number[];
    }) => {
      if (
        ![...added, ...updated, ...removed].some(
          (clientId) => clientId !== canvasDocument.clientID,
        )
      ) {
        return;
      }
      queueMicrotask(() =>
        syncCursorPositions(binding, provider, { selectionHighlight: true }),
      );
    };
    awareness.on("update", handleAwarenessUpdate);

    initLocalState(provider, username, cursorColor, false, {});
    provider.connect();
    return () => {
      window.cancelAnimationFrame(highlightFrame);
      clearCommentHighlights();
      highlightStyle?.remove();
      syncCommentHighlightsRef.current = () => undefined;
      sharedRoot.unobserveDeep(observeSharedRoot);
      removeEditorListener();
      removeCommands();
      removeFocusListeners();
      awareness.off("update", handleAwarenessUpdate);
      undoManager.off("stack-item-added", updateHistoryState);
      undoManager.off("stack-item-popped", updateHistoryState);
      undoManager.off("stack-cleared", updateHistoryState);
      undoManager.destroy();
      provider.disconnect();
      cursorContainer.remove();
      binding.root.destroy(binding);
      releaseDocumentCollabNodeCache(sharedRoot);
    };
  }, [
    canvasDocument,
    cursorColor,
    documentId,
    documentObjectId,
    editor,
    onRangeSelectionChange,
    preview,
    username,
  ]);

  return null;
}
