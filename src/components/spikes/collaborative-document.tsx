"use client";

import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  type EditorState,
} from "lexical";
import { useEffect, useState } from "react";
import type * as Y from "yjs";

import { Button } from "@/components/ui/button";
import {
  listDocumentInternalObjects,
  putDocumentInternalObject,
  type DocumentInternalObject,
} from "@/documents/document-model";
import { createDocumentProvider } from "@/documents/browser-yjs-provider";

type Props = {
  documentId: string;
  onExit: () => void;
};

export function CollaborativeDocument({ documentId, onExit }: Props) {
  const [provider] = useState(() =>
    createDocumentProvider(documentId, new Map()),
  );
  const document: Y.Doc = provider.document;
  const [text, setText] = useState("");
  const [internalObjects, setInternalObjects] = useState<
    DocumentInternalObject[]
  >([]);

  useEffect(() => {
    provider.connect();
    return () => provider.destroy();
  }, [provider]);

  useEffect(() => {
    const map = document.getMap("document-internal-objects");
    const refresh = () =>
      setInternalObjects(listDocumentInternalObjects(document));
    refresh();
    map.observe(refresh);
    return () => map.unobserve(refresh);
  }, [document]);

  function addInternalObject() {
    const number = internalObjects.length + 1;
    putDocumentInternalObject(document, {
      schemaVersion: 1,
      id: crypto.randomUUID(),
      documentId,
      type: "shape",
      text: `Internal visual ${number}`,
      x: 24 + number * 12,
      y: 150 + number * 10,
      width: 160,
      height: 64,
    });
  }

  function captureText(editorState: EditorState) {
    editorState.read(() => setText($getRoot().getTextContent()));
  }

  return (
    <div
      className="rounded-2xl border border-sky-700 bg-zinc-950 p-5"
      data-testid="focused-document"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-wider text-sky-300 uppercase">
            Document focus mode
          </p>
          <h3 className="mt-1 text-xl font-semibold">Focused research note</h3>
          <p className="mt-1 text-sm text-zinc-400">
            Lexical text and document-owned visual objects share one isolated
            Yjs document.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="border-zinc-700 bg-zinc-950 text-zinc-100 hover:bg-zinc-800"
          onClick={onExit}
        >
          Return to parent canvas
        </Button>
      </div>

      <LexicalComposer
        initialConfig={{
          namespace: `thinking-canvas-document-${documentId}`,
          nodes: [],
          onError(error) {
            throw error;
          },
        }}
      >
        <div className="relative mt-5 rounded-xl border border-zinc-700 bg-white text-zinc-950 shadow-2xl">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                aria-label="Focused collaborative document"
                className="min-h-52 px-6 py-5 leading-7 outline-none"
                data-testid="document-editor"
              />
            }
            placeholder={
              <p className="pointer-events-none absolute top-5 left-6 text-zinc-400">
                Write a shared research note…
              </p>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <DocumentYjsTextBinding document={document} />
          <OnChangePlugin onChange={captureText} />
          <div className="border-t border-zinc-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={addInternalObject}
              >
                Add document-internal visual
              </Button>
              <span
                className="text-xs text-zinc-500"
                data-testid="document-text-length"
              >
                {text.length} text characters
              </span>
            </div>
            <ul
              className="mt-3 grid gap-2 sm:grid-cols-2"
              aria-label="Document-internal visuals"
            >
              {internalObjects.map((object) => (
                <li
                  key={object.id}
                  className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm"
                >
                  {object.text}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-zinc-500">
              Internal object count:{" "}
              <span data-testid="internal-object-count">
                {internalObjects.length}
              </span>
              . Parent connector fields: excluded.
            </p>
          </div>
        </div>
      </LexicalComposer>
    </div>
  );
}

const remoteYjsTag = "document-yjs-remote";

function DocumentYjsTextBinding({ document }: { document: Y.Doc }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const sharedText = document.getText("lexical-document-text");

    const applySharedText = () => {
      const nextText = sharedText.toString();
      let currentText = "";
      editor.getEditorState().read(() => {
        currentText = $getRoot().getTextContent();
      });
      if (currentText === nextText) return;
      editor.update(
        () => {
          const root = $getRoot();
          root.clear();
          const paragraph = $createParagraphNode();
          if (nextText) paragraph.append($createTextNode(nextText));
          root.append(paragraph);
        },
        { tag: remoteYjsTag },
      );
    };

    applySharedText();
    sharedText.observe(applySharedText);
    const removeUpdateListener = editor.registerUpdateListener(
      ({ editorState, tags }) => {
        if (tags.has(remoteYjsTag)) return;
        let nextText = "";
        editorState.read(() => {
          nextText = $getRoot().getTextContent();
        });
        if (sharedText.toString() === nextText) return;
        document.transact(() => {
          sharedText.delete(0, sharedText.length);
          if (nextText) sharedText.insert(0, nextText);
        }, editor);
      },
    );

    return () => {
      sharedText.unobserve(applySharedText);
      removeUpdateListener();
    };
  }, [document, editor]);

  return null;
}
