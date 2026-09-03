import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { ProductDocumentEditor } from "@/components/documents/product-document-editor";
import { createProductDocumentObject } from "@/documents/product-document";

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

const canvasId = "10000000-0000-4000-8000-000000000001";
const objectId = "70000000-0000-4000-8000-000000000001";
const actorId = "80000000-0000-4000-8000-000000000001";

describe("ProductDocumentEditor", () => {
  it("renders continuous presentation settings and provides Escape return", () => {
    const onUpdate = vi.fn();
    const onExit = vi.fn();
    const documentObject = createProductDocumentObject({
      canvasId,
      objectId,
      actorId,
      issuedAt: "2026-09-02T00:00:00.000Z",
      title: "Research note",
      geometry: { x: 10, y: 20, width: 440, height: 560, rotation: 0 },
    });

    render(
      <ProductDocumentEditor
        canvasDocument={new Y.Doc()}
        canvasId={canvasId}
        canvasRole="owner"
        supabaseUrl="http://127.0.0.1:54321"
        supabasePublishableKey="test-key"
        documentObject={documentObject}
        username="Editor"
        canEdit
        canvasObjects={[]}
        canvasGroups={[]}
        showTemporaryAnnotations
        iconCatalog={null}
        onMoveObject={vi.fn()}
        onMoveGroup={vi.fn()}
        onRemoveObject={vi.fn()}
        onDeleteObject={vi.fn()}
        onDuplicateObjects={vi.fn()}
        onCopyObjects={vi.fn()}
        onCutObjects={vi.fn()}
        onReorderObjects={vi.fn()}
        onGroupObjects={vi.fn()}
        onUngroupObjects={vi.fn()}
        onObjectSelectionChange={vi.fn()}
        onUndoObjectChange={vi.fn()}
        onRedoObjectChange={vi.fn()}
        onUpdate={onUpdate}
        onExit={onExit}
      />,
    );

    const surface = screen.getByTestId("document-reading-surface");
    expect(surface).toHaveAttribute("data-layout-mode", "continuous");
    expect(surface).toHaveStyle({
      backgroundColor: "#ffffff",
      fontSize: "17px",
    });
    fireEvent.click(screen.getByRole("button", { name: /document settings/i }));
    expect(screen.getByText(/excluded from Markdown/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Display font"), {
      target: { value: "serif" },
    });
    expect(onUpdate).toHaveBeenCalledWith({
      settings: { ...documentObject.settings, displayFont: "serif" },
    });

    fireEvent.keyDown(screen.getByTestId("focused-product-document"), {
      key: "Escape",
    });
    expect(onExit).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByTestId("focused-product-document"), {
      key: "Escape",
    });
    expect(onExit).toHaveBeenCalledOnce();
  });
});
