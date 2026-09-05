import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProductDocumentComments } from "@/components/documents/product-document-comments";
import type { DocumentRangeTarget } from "@/documents/document-range";

vi.mock("@/comments/use-canvas-comments", () => ({
  useCanvasComments: () => ({
    threads: [],
    collaboration: {
      collaborators: [
        {
          kind: "ai",
          key: "primary-ai",
          name: "Thinking Canvas AI",
          role: "primary_ai",
        },
      ],
      aiAccess: {
        enabled: true,
        configuredAuthority: "comment_only",
        effectiveAuthority: "comment_only",
        canManage: true,
        version: 1,
      },
    },
    loading: false,
    pending: false,
    error: "",
    refresh: vi.fn(),
    execute: vi.fn(),
    cancelAiRun: vi.fn(),
    retryAiRun: vi.fn(),
  }),
}));

const selectedRange: DocumentRangeTarget = {
  documentObjectId: "70000000-0000-4000-8000-000000000001",
  anchor: "anchor",
  head: "head",
  quote: "Selected document text",
};

describe("ProductDocumentComments", () => {
  it("uses the canvas comment composer and exposes @ AI routing", () => {
    const props = {
      canvasId: "10000000-0000-4000-8000-000000000001",
      userId: "80000000-0000-4000-8000-000000000001",
      canvasRole: "owner" as const,
      documentObjectId: selectedRange.documentObjectId,
      supabaseUrl: "http://127.0.0.1:54321",
      supabasePublishableKey: "test-key",
      onAiTransactionApplied: vi.fn(),
      onUndoAiTransaction: vi.fn(),
      onSelectEvidence: vi.fn(),
      open: true,
      anchorPosition: { left: 300, top: 120 },
      onOpenChange: vi.fn(),
      onThreadsChange: vi.fn(),
    };
    render(
      <ProductDocumentComments {...props} selectedRange={selectedRange} />,
    );

    expect(screen.getByRole("dialog", { name: "New comment" })).toHaveClass(
      "rounded-3xl",
    );
    const composer = screen.getByLabelText("Comment");
    expect(composer).toHaveAttribute("placeholder", "Add a comment or type @");
    fireEvent.change(composer, { target: { value: "@" } });
    expect(
      screen.getByRole("option", { name: /Thinking Canvas AI/ }),
    ).toBeInTheDocument();
  });
});
