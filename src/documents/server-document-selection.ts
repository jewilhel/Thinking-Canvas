import { $generateNodesFromMarkdownString } from "@lexical/markdown";
import {
  $getAnchorAndFocusForUserState,
  createYjsBinding,
  syncLexicalUpdateToYjs,
  type Provider,
} from "@lexical/yjs";
import {
  $createRangeSelection,
  $getNodeByKey,
  $getRoot,
  $isTextNode,
  $setSelection,
  COLLABORATION_TAG,
  createEditor,
} from "lexical";
import * as Y from "yjs";

import { productDocumentLexicalNodes } from "@/components/documents/product-document-lexical-config";
import { documentMarkdownTransformers } from "@/documents/document-markdown";
import {
  decodeDocumentRelativePosition,
  type DocumentRangeTarget,
} from "@/documents/document-range";
import { documentContentRootName } from "@/documents/document-schema";

/** Use the editor's own selection semantics, including nested lists and links.
 * The isolated document keeps Lexical's Yjs wrapper caches off the live canvas.
 */
export function replaceStructuredDocumentSelection(input: {
  document: Y.Doc;
  documentId: string;
  range: DocumentRangeTarget;
  text: string;
}) {
  const isolated = new Y.Doc();
  Y.applyUpdate(isolated, Y.encodeStateAsUpdate(input.document));
  const before = Y.encodeStateVector(isolated);
  const editor = createEditor({
    namespace: "server-document-selection",
    nodes: productDocumentLexicalNodes,
    onError(error) {
      throw error;
    },
  });
  const binding = createYjsBinding({
    editor,
    id: input.documentId,
    doc: isolated,
    docMap: new Map([[input.documentId, isolated]]),
    rootName: documentContentRootName(input.documentId),
  });
  // Server-side editing has no presence or DOM cursors.
  const provider = {
    awareness: { getLocalState: () => null, getStates: () => new Map() },
  } as unknown as Provider;
  let removeListener = () => {};
  try {
    editor.update(
      () => {
        $getRoot().clear();
        binding.root.syncPropertiesFromYjs(binding, null);
        binding.root.applyChildrenYjsDelta(
          binding,
          binding.root.getSharedType().toDelta(),
        );
        binding.root.syncChildrenFromYjs(binding);
      },
      { discrete: true, skipTransforms: true, tag: COLLABORATION_TAG },
    );
    removeListener = editor.registerUpdateListener((update) => {
      syncLexicalUpdateToYjs(
        binding,
        provider,
        update.prevEditorState,
        update.editorState,
        update.dirtyElements,
        update.dirtyLeaves,
        update.normalizedNodes,
        update.tags,
      );
    });
    editor.update(
      () => {
        const points = $getAnchorAndFocusForUserState(binding, {
          anchorPos: decodeDocumentRelativePosition(input.range.anchor),
          focusPos: decodeDocumentRelativePosition(input.range.head),
          name: "",
          color: "",
          focusing: false,
          awarenessData: {},
        });
        const anchor = points.anchorKey
          ? $getNodeByKey(points.anchorKey)
          : null;
        const focus = points.focusKey ? $getNodeByKey(points.focusKey) : null;
        if (!anchor || !focus)
          throw new Error("The selected document range is detached.");
        const selection = $createRangeSelection();
        selection.anchor.set(
          anchor.getKey(),
          points.anchorOffset,
          $isTextNode(anchor) ? "text" : "element",
        );
        selection.focus.set(
          focus.getKey(),
          points.focusOffset,
          $isTextNode(focus) ? "text" : "element",
        );
        if (selection.isCollapsed())
          throw new Error("The selected document range is detached.");
        $setSelection(selection);
        if (input.text) {
          const markdown = input.text.replace(/^([ \t]*)[•] /gm, "$1- ");
          selection.insertNodes(
            $generateNodesFromMarkdownString(
              markdown,
              documentMarkdownTransformers,
            ),
          );
        } else {
          selection.removeText();
        }
      },
      { discrete: true },
    );
    Y.applyUpdate(input.document, Y.encodeStateAsUpdate(isolated, before));
  } finally {
    removeListener();
    binding.root.destroy(binding);
    isolated.destroy();
  }
}
