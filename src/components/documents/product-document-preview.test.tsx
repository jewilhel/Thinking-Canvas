import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { ProductDocumentPreview } from "@/components/documents/product-document-preview";
import {
  createProductDocumentObject,
  getProductDocumentContentRoot,
} from "@/documents/product-document";

describe("ProductDocumentPreview", () => {
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
        canvasObjects={[documentObject]}
        canvasGroups={[]}
        showTemporaryAnnotations
        iconCatalog={null}
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
