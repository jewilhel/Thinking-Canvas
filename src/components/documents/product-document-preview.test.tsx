import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import {
  CommentWorkspaceProvider,
  useCommentWorkspace,
} from "@/components/comments/comment-workspace";
import type { CommentThread } from "@/comments/comment-model";
import { encodeDocumentRelativePosition } from "@/documents/document-range";
import * as Y from "yjs";

import { ProductDocumentPreview } from "@/components/documents/product-document-preview";
import {
  createProductDocumentObject,
  getProductDocumentContentRoot,
} from "@/documents/product-document";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ProductDocumentPreview", () => {
  it("renders persisted open comment highlights in preview without writing document content", async () => {
    const registry = new Map<string, Set<Range>>();
    vi.stubGlobal("CSS", { highlights: registry });
    vi.stubGlobal(
      "Highlight",
      class extends Set<Range> {
        constructor(...ranges: Range[]) {
          super(ranges);
        }
      },
    );
    const canvasDocument = new Y.Doc();
    const documentObject = createProductDocumentObject({
      canvasId: "10000000-0000-4000-8000-000000000001",
      objectId: "70000000-0000-4000-8000-000000000001",
      actorId: "80000000-0000-4000-8000-000000000001",
      issuedAt: "2026-09-07T00:00:00Z",
      title: "Highlights",
      geometry: { x: 10, y: 20, width: 440, height: 560, rotation: 0 },
    });
    const paragraph = new Y.XmlText();
    paragraph.setAttribute("__type", "paragraph");
    const text = new Y.Map();
    text.set("__type", "text");
    paragraph.insertEmbed(0, text);
    paragraph.insert(1, "Actual document body");
    getProductDocumentContentRoot(
      canvasDocument,
      documentObject.documentId,
    ).insertEmbed(0, paragraph);
    const original = Y.encodeStateAsUpdate(canvasDocument);
    const target = {
      documentObjectId: documentObject.id,
      anchor: encodeDocumentRelativePosition(
        Y.createRelativePositionFromTypeIndex(paragraph, 1),
      ),
      head: encodeDocumentRelativePosition(
        Y.createRelativePositionFromTypeIndex(paragraph, 7),
      ),
      quote: "Actual",
    };
    function Preview({ status }: { status: CommentThread["status"] }) {
      const { setThreads } = useCommentWorkspace();
      useEffect(() => {
        setThreads([
          {
            id: "comment",
            status,
            authorName: "Owner",
            documentRange: target,
          } as CommentThread,
        ]);
      }, [status, setThreads]);
      return (
        <ProductDocumentPreview
          canvasDocument={canvasDocument}
          documentObject={documentObject}
          screenBounds={{ left: 20, top: 30, width: 440, height: 560 }}
        />
      );
    }
    const view = render(
      <CommentWorkspaceProvider>
        <Preview status="open" />
      </CommentWorkspaceProvider>,
    );
    const key = `document-comment-${documentObject.id}-preview`;
    await waitFor(() => expect(registry.get(key)?.size).toBe(1));
    expect([...registry.get(key)!][0]?.toString()).toBe("Actual");
    expect(Y.encodeStateAsUpdate(canvasDocument)).toEqual(original);
    for (const status of ["resolved", "dismissed"] as const) {
      view.rerender(
        <CommentWorkspaceProvider>
          <Preview status={status} />
        </CommentWorkspaceProvider>,
      );
      await waitFor(() => expect(registry.has(key)).toBe(false));
    }
    view.unmount();
    expect(
      document.querySelector(
        `[data-document-comment-highlight="${documentObject.id}"]`,
      ),
    ).toBeNull();
  });
  it("renders the same title and structured first-page body without card metadata", async () => {
    const canvasDocument = new Y.Doc();
    const documentObject = createProductDocumentObject({
      canvasId: "10000000-0000-4000-8000-000000000001",
      objectId: "70000000-0000-4000-8000-000000000001",
      actorId: "80000000-0000-4000-8000-000000000001",
      issuedAt: "2026-09-04T00:00:00.000Z",
      title: "Shared first page",
      geometry: { x: 10, y: 20, width: 440, height: 560, rotation: 0 },
    });
    const paragraph = new Y.XmlText();
    paragraph.setAttribute("__type", "paragraph");
    const text = new Y.Map();
    text.set("__type", "text");
    paragraph.insertEmbed(0, text);
    paragraph.insert(1, "Actual document body");
    getProductDocumentContentRoot(
      canvasDocument,
      documentObject.documentId,
    ).insertEmbed(0, paragraph);

    const { getByTestId, queryByText } = render(
      <ProductDocumentPreview
        canvasDocument={canvasDocument}
        documentObject={documentObject}
        screenBounds={{ left: 20, top: 30, width: 440, height: 560 }}
      />,
    );

    await waitFor(() =>
      expect(getByTestId("product-document-preview-body")).toHaveTextContent(
        "Actual document body",
      ),
    );
    expect(
      getByTestId("product-document-preview-body").querySelector("p"),
    ).toHaveTextContent("Actual document body");
    expect(queryByText("Shared first page")).toBeInTheDocument();
    expect(queryByText("Continuous")).not.toBeInTheDocument();
  });
});
