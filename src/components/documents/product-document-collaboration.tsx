"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  createUndoManager,
  createYjsBinding,
  initLocalState,
  setLocalStateFocus,
  syncCursorPositions,
  syncLexicalUpdateToYjs,
  syncYjsChangesToLexical,
} from "@lexical/yjs";
import {
  $createParagraphNode,
  $getRoot,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COLLABORATION_TAG,
  COMMAND_PRIORITY_EDITOR,
  mergeRegister,
  REDO_COMMAND,
  UNDO_COMMAND,
} from "lexical";
import { useEffect } from "react";
import * as Y from "yjs";

import { CanvasLexicalProvider } from "@/documents/canvas-lexical-provider";
import { documentContentRootName } from "@/documents/document-schema";

export function ProductDocumentCollaboration({
  canvasDocument,
  documentId,
  username,
  cursorColor,
}: {
  canvasDocument: Y.Doc;
  documentId: string;
  username: string;
  cursorColor: string;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const provider = new CanvasLexicalProvider(canvasDocument, documentId);
    const documentMap = new Map([[documentId, canvasDocument]]);
    const binding = createYjsBinding({
      editor,
      id: documentId,
      doc: canvasDocument,
      docMap: documentMap,
      rootName: documentContentRootName(documentId),
    });
    const sharedRoot = binding.root.getSharedType();
    const undoManager = createUndoManager(binding, sharedRoot);
    const cursorContainer = document.createElement("div");
    cursorContainer.dataset.lexicalDocumentCursors = documentId;
    document.body.append(cursorContainer);
    binding.cursorsContainer = cursorContainer;

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
      },
    );

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
    const handleAwarenessUpdate = () => {
      queueMicrotask(() =>
        syncCursorPositions(binding, provider, { selectionHighlight: true }),
      );
    };
    provider.awareness.on("update", handleAwarenessUpdate);

    initLocalState(provider, username, cursorColor, false, {});
    provider.connect();
    return () => {
      sharedRoot.unobserveDeep(observeSharedRoot);
      removeEditorListener();
      removeCommands();
      removeFocusListeners();
      provider.awareness.off("update", handleAwarenessUpdate);
      undoManager.off("stack-item-added", updateHistoryState);
      undoManager.off("stack-item-popped", updateHistoryState);
      undoManager.off("stack-cleared", updateHistoryState);
      undoManager.destroy();
      provider.disconnect();
      cursorContainer.remove();
      binding.root.destroy(binding);
    };
  }, [canvasDocument, cursorColor, documentId, editor, username]);

  return null;
}
