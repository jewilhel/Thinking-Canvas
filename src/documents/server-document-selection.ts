import { $generateNodesFromMarkdownString } from "@lexical/markdown";
import {
  $getAnchorAndFocusForUserState,
  createYjsBinding,
  syncLexicalUpdateToYjs,
  type Provider,
  type UserState,
} from "@lexical/yjs";
import {
  $createRangeSelection,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
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
  encodeDocumentRelativePosition,
  boundedDocumentRangeQuote,
  relocateDocumentRange,
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
  format?: "plain" | "bold" | "italic" | "bold_italic";
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
  let localState: UserState = {
    anchorPos: null,
    focusPos: null,
    name: "",
    color: "",
    focusing: false,
    awarenessData: {},
  };
  const provider = {
    awareness: {
      getLocalState: () => localState,
      getStates: () => new Map(),
      setLocalState: (state: UserState) => {
        localState = state;
      },
    },
  } as unknown as Provider;
  let removeListener = () => {};
  try {
    let replacementQuote = "";
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
          const nodes = $generateNodesFromMarkdownString(
            markdown,
            documentMarkdownTransformers,
          );
          const additionalFormat =
            input.format === "bold"
              ? 1
              : input.format === "italic"
                ? 2
                : input.format === "bold_italic"
                  ? 3
                  : 0;
          if (additionalFormat) {
            for (const node of nodes) {
              const texts = $isTextNode(node)
                ? [node]
                : $isElementNode(node)
                  ? node.getAllTextNodes()
                  : [];
              for (const text of texts)
                text.setFormat(text.getFormat() | additionalFormat);
            }
          }
          const insertedLength = nodes.reduce(
            (sum, node) =>
              sum +
              ($isTextNode(node)
                ? node.getTextContentSize()
                : $isElementNode(node)
                  ? node
                      .getAllTextNodes()
                      .reduce(
                        (count, text) => count + text.getTextContentSize(),
                        0,
                      )
                  : 0),
            0,
          );
          selection.insertNodes(nodes);
          const endSelection = $getSelection();
          if (
            $isRangeSelection(endSelection) &&
            endSelection.focus.type === "text" &&
            insertedLength > 0
          ) {
            const texts = $getRoot().getAllTextNodes();
            let cursor = texts.findIndex(
              (node) => node.getKey() === endSelection.focus.key,
            );
            let offset = endSelection.focus.offset;
            let remaining = insertedLength;
            while (cursor >= 0 && remaining > offset) {
              remaining -= offset;
              cursor -= 1;
              offset = texts[cursor]?.getTextContentSize() ?? 0;
            }
            const start = texts[cursor];
            if (!start)
              throw new Error(
                "The replacement selection could not be anchored.",
              );
            endSelection.anchor.set(start.getKey(), offset - remaining, "text");
            replacementQuote = boundedDocumentRangeQuote(
              endSelection.getTextContent(),
            );
          }
        } else {
          selection.removeText();
        }
      },
      { discrete: true },
    );
    if (replacementQuote && localState.anchorPos && localState.focusPos) {
      relocateDocumentRange(isolated, input.range, {
        anchor: encodeDocumentRelativePosition(localState.anchorPos),
        head: encodeDocumentRelativePosition(localState.focusPos),
        quote: replacementQuote,
      });
    }
    Y.applyUpdate(input.document, Y.encodeStateAsUpdate(isolated, before));
  } finally {
    removeListener();
    binding.root.destroy(binding);
    isolated.destroy();
  }
}
