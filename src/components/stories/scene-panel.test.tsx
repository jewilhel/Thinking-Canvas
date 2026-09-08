import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ScenePanel } from "@/components/stories/scene-panel";
import type { PrimaryStory } from "@/stories/story-model";

afterEach(cleanup);

const story: PrimaryStory = {
  id: "10000000-0000-4000-8000-000000000001",
  revision: 1,
  title: "Scenes",
  scenes: [
    {
      id: "20000000-0000-4000-8000-000000000001",
      title: "Opening view",
      position: 0,
      camera: { version: 1, center: { x: 100, y: 80 }, zoom: 1 },
      target: {
        version: 1,
        kind: "viewport",
        bounds: { x: 0, y: 0, width: 800, height: 600 },
      },
      narration: null,
      createdAt: "2026-09-07T00:00:00.000Z",
      updatedAt: "2026-09-07T00:00:00.000Z",
    },
  ],
};

const twoSceneStory: PrimaryStory = {
  ...story,
  revision: 2,
  scenes: [
    story.scenes[0]!,
    {
      ...story.scenes[0]!,
      id: "20000000-0000-4000-8000-000000000002",
      title: "Detail",
      position: 1,
    },
  ],
};

function renderPanel(
  overrides: Partial<ComponentProps<typeof ScenePanel>> = {},
) {
  const props: ComponentProps<typeof ScenePanel> = {
    open: true,
    story: null,
    objects: [],
    loading: false,
    saving: false,
    error: "",
    canCapture: true,
    activeSceneId: null,
    onAdd: vi.fn(),
    onChoose: vi.fn(),
    onRename: vi.fn(),
    onReplace: vi.fn(),
    onReorder: vi.fn(),
    onDelete: vi.fn(),
    deletedScene: null,
    onUndoDelete: vi.fn(),
    onDismiss: vi.fn(),
    ...overrides,
  };
  render(<ScenePanel {...props} />);
  return props;
}

describe("ScenePanel", () => {
  it("explains viewport capture in the empty state", () => {
    const props = renderPanel();

    expect(screen.getByText("No scenes")).toBeInTheDocument();
    expect(
      screen.getByText(/Position and zoom the canvas/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add Scene" }));
    expect(props.onAdd).toHaveBeenCalledOnce();
  });

  it("shows a saved scene and reports the active step", () => {
    const props = renderPanel({
      story,
      activeSceneId: story.scenes[0]!.id,
    });

    const sceneButton = screen.getByRole("button", { name: "Opening view" });
    expect(sceneButton).toHaveAttribute("aria-current", "step");
    fireEvent.click(sceneButton);
    expect(props.onChoose).toHaveBeenCalledWith(story.scenes[0]);
  });

  it("blocks capture while the canvas is not durably saved", () => {
    renderPanel({ canCapture: false });

    expect(screen.getByRole("button", { name: "Add Scene" })).toBeDisabled();
  });

  it("renames and replaces a scene from its scoped actions menu", () => {
    const props = renderPanel({ story });

    fireEvent.click(
      screen.getByRole("button", { name: "Scene actions for Opening view" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    const input = screen.getByRole("textbox", { name: "Rename Opening view" });
    fireEvent.change(input, { target: { value: "Introduction" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onRename).toHaveBeenCalledWith(
      story.scenes[0],
      "Introduction",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Scene actions for Opening view" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    expect(props.onReplace).toHaveBeenCalledWith(story.scenes[0]);
  });

  it("reorders with accessible move controls and deletes with undo", () => {
    const props = renderPanel({
      story: twoSceneStory,
      deletedScene: { id: story.scenes[0]!.id, title: "Opening view" },
    });

    expect(
      screen.getByRole("button", { name: "Move Opening view earlier" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Move Opening view later" }),
    );
    expect(props.onReorder).toHaveBeenCalledWith([
      twoSceneStory.scenes[1]!.id,
      twoSceneStory.scenes[0]!.id,
    ]);

    fireEvent.click(
      screen.getByRole("button", { name: "Scene actions for Detail" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(props.onDelete).toHaveBeenCalledWith(twoSceneStory.scenes[1]);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(props.onUndoDelete).toHaveBeenCalledOnce();
  });

  it("reorders rows by drag and drop", () => {
    const props = renderPanel({ story: twoSceneStory });
    const openingRow = screen
      .getByRole("button", { name: "Opening view" })
      .closest("li");
    const detailRow = screen
      .getByRole("button", { name: "Detail" })
      .closest("li");

    expect(openingRow).not.toBeNull();
    expect(detailRow).not.toBeNull();
    fireEvent.dragStart(openingRow!);
    fireEvent.dragOver(detailRow!);
    fireEvent.drop(detailRow!);

    expect(props.onReorder).toHaveBeenCalledWith([
      twoSceneStory.scenes[1]!.id,
      twoSceneStory.scenes[0]!.id,
    ]);
  });
});
