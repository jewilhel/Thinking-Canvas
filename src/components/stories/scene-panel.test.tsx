import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clampScenePanelPlacement,
  resizeScenePanelLeft,
  ScenePanel,
} from "@/components/stories/scene-panel";
import type { CommentThread } from "@/comments/comment-model";
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
    loopEnabled: true,
    sceneThreads: [],
    onAdd: vi.fn(),
    onChoose: vi.fn(),
    onRename: vi.fn(),
    onReplace: vi.fn(),
    onReorder: vi.fn(),
    onDelete: vi.fn(),
    deletedScene: null,
    onUndoDelete: vi.fn(),
    onLoopChange: vi.fn(),
    onAddSceneComment: vi.fn(),
    onOpenSceneThread: vi.fn(),
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

  it("shows only the supplied active-scene context and opens its composer", () => {
    const sceneThread = {
      id: "30000000-0000-4000-8000-000000000001",
      authorName: "Jason",
      body: "Pause here for discussion",
      status: "open",
    } as CommentThread;
    const props = renderPanel({
      story,
      activeSceneId: story.scenes[0]!.id,
      sceneThreads: [sceneThread],
    });

    expect(screen.getByText("Pause here for discussion")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Add comment" }));
    expect(props.onAddSceneComment).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByText("Pause here for discussion"));
    expect(props.onOpenSceneThread).toHaveBeenCalledWith(sceneThread.id);
  });

  it("blocks capture while the canvas is not durably saved", () => {
    renderPanel({ canCapture: false });

    expect(screen.getByRole("button", { name: "Add Scene" })).toBeDisabled();
  });

  it("toggles continuous scene looping", () => {
    const props = renderPanel({ story, loopEnabled: true });

    const loop = screen.getByRole("switch", { name: "Loop" });
    expect(loop).toHaveAttribute("aria-checked", "true");
    fireEvent.click(loop);
    expect(props.onLoopChange).toHaveBeenCalledWith(false);
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

  it("removes repeated reorder controls and deletes with undo", () => {
    const props = renderPanel({
      story: twoSceneStory,
      activeSceneId: twoSceneStory.scenes[0]!.id,
      deletedScene: { id: story.scenes[0]!.id, title: "Opening view" },
    });

    expect(screen.queryByText("Move Opening view")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Move selected scene earlier" }),
    ).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("button", { name: "Opening view" }), {
      key: "ArrowDown",
      altKey: true,
    });
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

  it("bounds movement and left-edge resizing", () => {
    const viewport = { width: 1024, height: 768 };
    const placement = { left: 500, top: 100, width: 400 };

    expect(resizeScenePanelLeft(placement, 1000, viewport, 440)).toEqual({
      left: 580,
      top: 100,
      width: 320,
    });
    expect(resizeScenePanelLeft(placement, -1000, viewport, 440)).toEqual({
      left: 260,
      top: 100,
      width: 640,
    });
    expect(
      clampScenePanelPlacement(
        { left: 1000, top: -100, width: 900 },
        viewport,
        440,
      ),
    ).toEqual({ left: 368, top: 16, width: 640 });
  });

  it("exposes keyboard-equivalent panel movement and resizing", () => {
    renderPanel({ story });
    const panel = screen.getByRole("dialog");
    vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({
      x: 500,
      y: 100,
      left: 500,
      top: 100,
      right: 900,
      bottom: 540,
      width: 400,
      height: 440,
      toJSON: () => ({}),
    });

    fireEvent.keyDown(screen.getByLabelText("Move scene panel"), {
      key: "ArrowRight",
    });
    expect(panel).toHaveStyle({ left: "510px", top: "100px" });
    fireEvent.keyDown(
      screen.getByLabelText("Resize scene panel from left edge"),
      { key: "ArrowLeft" },
    );
    expect(panel).toHaveStyle({ left: "490px", width: "410px" });
  });
});
