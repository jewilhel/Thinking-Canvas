"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  createYjsBinding,
  initLocalState,
  syncLexicalUpdateToYjs,
  syncYjsChangesToLexical,
} from "@lexical/yjs";
import { $createParagraphNode, $getRoot, COLLABORATION_TAG } from "lexical";
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
    const provider = new CanvasLexicalProvider(canvasDocument);
    const documentMap = new Map([[documentId, canvasDocument]]);
    const binding = createYjsBinding({
      editor,
      id: documentId,
      doc: canvasDocument,
      docMap: documentMap,
      rootName: documentContentRootName(documentId),
    });
    const sharedRoot = binding.root.getSharedType();

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

    initLocalState(provider, username, cursorColor, false, {});
    provider.connect();
    return () => {
      sharedRoot.unobserveDeep(observeSharedRoot);
      removeEditorListener();
      provider.disconnect();
      binding.root.destroy(binding);
    };
  }, [canvasDocument, cursorColor, documentId, editor, username]);

  return null;
}
