import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkspacePrimaryDock } from "@/components/canvas/workspace-primary-dock";

describe("WorkspacePrimaryDock", () => {
  it("exposes document insertion as a keyboard-described primary tool", () => {
    const onChooseTool = vi.fn();
    render(
      <WorkspacePrimaryDock
        activeTool="select"
        recentShape="rectangle"
        simulatedAiEnabled={false}
        onChooseTool={onChooseTool}
        onChooseShape={vi.fn()}
        onChooseIcon={vi.fn()}
        onAddSimulatedAiIdea={vi.fn()}
        commentPlacementActive={false}
        onChooseComments={vi.fn()}
        canDraw
        lastDrawingTool="pen"
        penColor="#18181b"
        penThickness={5}
        onPenColorChange={vi.fn()}
        onPenThicknessChange={vi.fn()}
      />,
    );

    const documentTool = screen.getByRole("button", { name: "Document" });
    expect(documentTool).toHaveAttribute("aria-keyshortcuts", "D");
    fireEvent.click(documentTool);
    expect(onChooseTool).toHaveBeenCalledWith("document");
  });
});
