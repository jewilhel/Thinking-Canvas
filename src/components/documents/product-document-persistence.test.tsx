import { act, cleanup, render } from "@testing-library/react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { $getRoot, type LexicalEditor } from "lexical";
import { afterEach, expect, it } from "vitest";
import * as Y from "yjs";
import { ProductDocumentCollaboration } from "./product-document-collaboration";

afterEach(cleanup);
const documentId = "70000000-0000-4000-8000-000000000001";

function mountDocument(document: Y.Doc, preview = false) {
  let editor!: LexicalEditor;
  function CaptureEditor() {
    [editor] = useLexicalComposerContext();
    return null;
  }
  const view = render(
    <LexicalComposer
      initialConfig={{
        namespace: "persistence-test",
        editorState: null,
        editable: !preview,
        onError: (error) => {
          throw error;
        },
      }}
    >
      <RichTextPlugin
        contentEditable={<ContentEditable aria-label="Body" />}
        placeholder={null}
        ErrorBoundary={LexicalErrorBoundary}
      />
      <CaptureEditor />
      <ProductDocumentCollaboration
        canvasDocument={document}
        documentId={documentId}
        documentObjectId={documentId}
        username="Tester"
        cursorColor="#7c3aed"
        preview={preview}
      />
    </LexicalComposer>,
  );
  return { ...view, editor };
}

it("persists typing into the first empty paragraph through preview, reopen, and a fresh Yjs restore", () => {
  const document = new Y.Doc();
  const initialPreview = mountDocument(document, true);
  initialPreview.unmount();
  const focused = mountDocument(document);
  act(() =>
    focused.editor.update(
      () => {
        $getRoot()
          .getFirstChildOrThrow()
          .selectEnd()
          .insertText("First paragraph survives.");
      },
      { discrete: true },
    ),
  );
  focused.unmount();
  const preview = mountDocument(document, true);
  expect(
    preview.editor.getEditorState().read(() => $getRoot().getTextContent()),
  ).toBe("First paragraph survives.");
  preview.unmount();
  const reopened = mountDocument(document);
  expect(
    reopened.editor.getEditorState().read(() => $getRoot().getTextContent()),
  ).toBe("First paragraph survives.");
  reopened.unmount();
  const restored = new Y.Doc();
  Y.applyUpdate(restored, Y.encodeStateAsUpdate(document));
  const reloaded = mountDocument(restored);
  expect(
    reloaded.editor.getEditorState().read(() => $getRoot().getTextContent()),
  ).toBe("First paragraph survives.");
});

it("does not write an empty document while showing its read-only preview", () => {
  const document = new Y.Doc();
  const before = Y.encodeStateAsUpdate(document);
  const preview = mountDocument(document, true);
  preview.unmount();
  expect(Y.encodeStateAsUpdate(document)).toEqual(before);
});
