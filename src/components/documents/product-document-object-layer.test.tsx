import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CanvasObjectV2 } from "@/canvas/canvas-document";
import { ProductDocumentObjectLayer } from "@/components/documents/product-document-object-layer";
import {
  documentLocalGeometry,
  documentWorldGeometry,
} from "@/documents/document-containment";
import { createProductDocumentObject } from "@/documents/product-document";

const canvasId = "10000000-0000-4000-8000-000000000001";
const actorId = "80000000-0000-4000-8000-000000000001";
const documentId = "70000000-0000-4000-8000-000000000001";
const objectId = "30000000-0000-4000-8000-000000000001";

describe("ProductDocumentObjectLayer", () => {
  it("renders only owned page objects and exposes keyboard move/removal", () => {
    const documentObject = createProductDocumentObject({
      canvasId,
      objectId: documentId,
      actorId,
      issuedAt: "2026-09-02T00:00:00.000Z",
      geometry: { x: 100, y: 100, width: 480, height: 640, rotation: 0 },
    });
    const geometry = { x: 140, y: 160, width: 120, height: 80, rotation: 0 };
    const object = {
      schemaVersion: 2,
      id: objectId,
      canvasId,
      createdBy: actorId,
      createdAt: "2026-09-02T00:00:00.000Z",
      updatedAt: "2026-09-02T00:00:00.000Z",
      type: "shape",
      shape: "rectangle",
      text: "Embedded idea",
      geometry,
      style: {
        fill: "#ffffff",
        outline: "#334155",
        outlineWidth: 2,
        fontFamily: "Inter",
        fontSize: 16,
      },
      documentOwnerId: documentId,
      documentLocal: documentLocalGeometry(documentObject, geometry),
    } satisfies CanvasObjectV2;
    const onMove = vi.fn();
    const onRemove = vi.fn();
    const onDuplicate = vi.fn();

    render(
      <ProductDocumentObjectLayer
        documentObject={documentObject}
        objects={[object]}
        groups={[]}
        pageIndex={0}
        pageHeight={null}
        canEdit
        showTemporaryAnnotations
        iconCatalog={null}
        onMove={onMove}
        onMoveGroup={vi.fn()}
        onRemove={onRemove}
        onDelete={vi.fn()}
        onDuplicate={onDuplicate}
        onCopy={vi.fn()}
        onCut={vi.fn()}
        onReorder={vi.fn()}
        onGroup={vi.fn()}
        onUngroup={vi.fn()}
        onSelectionChange={vi.fn()}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
      />,
    );

    const embedded = screen.getByRole("group", {
      name: "Embedded idea embedded canvas object",
    });
    fireEvent.focus(embedded);
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(onDuplicate).toHaveBeenCalledWith([objectId]);
    fireEvent.keyDown(embedded, { key: "ArrowRight" });
    const expectedWorld = documentWorldGeometry(
      documentObject,
      { ...object.documentLocal, x: object.documentLocal.x + 1 },
      object.geometry,
    );
    expect(onMove).toHaveBeenCalledWith(
      objectId,
      expectedWorld.x,
      expectedWorld.y,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Remove from document" }),
    );
    expect(onRemove).toHaveBeenCalledWith([object.id]);
  });
});
