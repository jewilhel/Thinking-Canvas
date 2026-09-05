import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { ProductDocumentComments } from "@/components/documents/product-document-comments";
import type { DocumentRangeTarget } from "@/documents/document-range";

vi.mock("@/comments/use-canvas-comments", () => ({
  useCanvasComments: () => ({
    threads: [],
    collaboration: null,
    loading: false,
    pending: false,
    error: "",
    execute: vi.fn(),
  }),
}));

const selectedRange: DocumentRangeTarget = {
  documentObjectId: "70000000-0000-4000-8000-000000000001",
  anchor: "anchor",
  head: "head",
  quote: "Selected document text",
};

describe("ProductDocumentComments", () => {
  it("keeps the selected document range after focus moves into comments", () => {
    const props = {
      canvasDocument: new Y.Doc(),
      canvasId: "10000000-0000-4000-8000-000000000001",
      canvasRole: "owner" as const,
      documentObjectId: selectedRange.documentObjectId,
      objects: [],
      selectedObjectIds: [],
      supabaseUrl: "http://127.0.0.1:54321",
      supabasePublishableKey: "test-key",
      onAiTransactionApplied: vi.fn(),
      onUndoAiTransaction: vi.fn(),
      compact: true,
    };
    const { rerender } = render(
      <ProductDocumentComments {...props} selectedRange={selectedRange} />,
    );

    const comments = screen.getByRole("button", { name: "Comments" });
    fireEvent.mouseDown(comments);
    fireEvent.click(comments);
    rerender(<ProductDocumentComments {...props} selectedRange={null} />);

    expect(
      screen.getByText("Comment on “Selected document text”"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("New document comment")).toBeEnabled();
  });
});
