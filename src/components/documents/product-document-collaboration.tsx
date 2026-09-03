"use client";

import { LexicalCollaboration } from "@lexical/react/LexicalCollaborationContext";
import { CollaborationPlugin } from "@lexical/react/LexicalCollaborationPlugin";
import { useMemo } from "react";
import type * as Y from "yjs";

import { createCanvasLexicalProviderFactory } from "@/documents/canvas-lexical-provider";
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
  const providerFactory = useMemo(
    () => createCanvasLexicalProviderFactory(canvasDocument),
    [canvasDocument],
  );

  return (
    <LexicalCollaboration>
      <CollaborationPlugin
        id={documentId}
        providerFactory={providerFactory}
        rootName={documentContentRootName(documentId)}
        shouldBootstrap
        username={username}
        cursorColor={cursorColor}
        selectionHighlight
      />
    </LexicalCollaboration>
  );
}
