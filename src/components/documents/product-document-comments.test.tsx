import {
  fireEvent,
  render as renderUI,
  screen,
  within,
  cleanup,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommentWorkspaceProvider } from "@/components/comments/comment-workspace";
import { useCanvasComments } from "@/comments/use-canvas-comments";

function TestWorkspace({ children }: { children: ReactNode }) {
  const service = useCanvasComments("test", "test", "test");
  return (
    <CommentWorkspaceProvider
      initialActive={`document-composer:${selectedRange.documentObjectId}`}
      initialService={service}
    >
      {children}
    </CommentWorkspaceProvider>
  );
}
function render(ui: ReactNode) {
  return renderUI(ui, { wrapper: TestWorkspace });
}
afterEach(cleanup);

import { ProductDocumentComments } from "@/components/documents/product-document-comments";
import type { DocumentRangeTarget } from "@/documents/document-range";

const commentHook = vi.hoisted(() => ({
  pending: false,
  execute: vi.fn(),
}));

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
    pending: commentHook.pending,
    error: "",
    refresh: vi.fn(),
    execute: commentHook.execute,
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
  beforeEach(() => {
    commentHook.pending = false;
    commentHook.execute.mockReset();
    commentHook.execute.mockResolvedValue(null);
  });

  it("uses the canvas comment composer and exposes @ AI routing", () => {
    const props = {
      canvasId: "10000000-0000-4000-8000-000000000001",
      userId: "80000000-0000-4000-8000-000000000001",
      canvasRole: "owner" as const,
      documentObjectId: selectedRange.documentObjectId,
      documentTitle: "Research notes",
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
      "rounded-2xl",
    );
    const composer = screen.getByLabelText("Comment");
    expect(composer).toHaveAttribute("placeholder", "Add a comment or type @");
    fireEvent.change(composer, { target: { value: "@" } });
    expect(
      screen.getByRole("option", { name: /Thinking Canvas AI/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("Research notes")).toBeInTheDocument();
    expect(screen.getByText("Selected text")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove selected text context",
      }),
    );
    expect(screen.queryByText("Selected text")).not.toBeInTheDocument();
  });

  it("submits the visible document and selected-text context choices", async () => {
    render(
      <ProductDocumentComments
        canvasId="10000000-0000-4000-8000-000000000001"
        userId="80000000-0000-4000-8000-000000000001"
        canvasRole="owner"
        documentObjectId={selectedRange.documentObjectId}
        documentTitle="Research notes"
        selectedRange={selectedRange}
        supabaseUrl="http://127.0.0.1:54321"
        supabasePublishableKey="test-key"
        onAiTransactionApplied={vi.fn()}
        onUndoAiTransaction={vi.fn()}
        onSelectEvidence={vi.fn()}
        open
        anchorPosition={{ left: 300, top: 120 }}
        onOpenChange={vi.fn()}
        onThreadsChange={vi.fn()}
      />,
    );
    const dialog = screen
      .getAllByRole("dialog", { name: "New comment" })
      .at(-1)!;

    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Remove document context Research notes",
      }),
    );
    fireEvent.change(within(dialog).getByLabelText("Comment"), {
      target: { value: "Review this selection" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Submit comment" }),
    );

    expect(commentHook.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        orderedContextIds: [],
        documentRange: selectedRange,
        documentAiContext: {
          includeDocument: false,
          includeSelectedText: true,
        },
      }),
    );
  });

  it("keeps a pending document comment anchored until creation completes", () => {
    commentHook.pending = true;
    const onOpenChange = vi.fn();
    const props = {
      canvasId: "10000000-0000-4000-8000-000000000001",
      userId: "80000000-0000-4000-8000-000000000001",
      canvasRole: "owner" as const,
      documentObjectId: selectedRange.documentObjectId,
      documentTitle: "Research notes",
      supabaseUrl: "http://127.0.0.1:54321",
      supabasePublishableKey: "test-key",
      onAiTransactionApplied: vi.fn(),
      onUndoAiTransaction: vi.fn(),
      onSelectEvidence: vi.fn(),
      open: true,
      anchorPosition: { left: 300, top: 120 },
      onOpenChange,
      onThreadsChange: vi.fn(),
    };
    render(
      <ProductDocumentComments {...props} selectedRange={selectedRange} />,
    );

    const dialog = screen
      .getAllByRole("dialog", { name: "New comment" })
      .at(-1)!;
    expect(within(dialog).getByRole("status")).toHaveTextContent(
      "Creating comment…",
    );
    const close = within(dialog).getByRole("button", {
      name: "Close comment composer",
    });
    expect(close).toBeDisabled();
    fireEvent.click(close);
    fireEvent.pointerDown(document.body);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(dialog).toHaveAttribute("aria-busy", "true");
    commentHook.pending = false;
  });
});
