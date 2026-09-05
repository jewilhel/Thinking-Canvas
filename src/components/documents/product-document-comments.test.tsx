import { render, screen } from "@testing-library/react";
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
  it("uses the pinned selected range while the composer owns focus", () => {
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
      open: true,
      anchorPosition: { left: 300, top: 120 },
      onOpenChange: vi.fn(),
      onThreadsChange: vi.fn(),
    };
    render(
      <ProductDocumentComments {...props} selectedRange={selectedRange} />,
    );

    expect(
      screen.getByText("Comment on “Selected document text”"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("New document comment")).toBeEnabled();
  });
});
