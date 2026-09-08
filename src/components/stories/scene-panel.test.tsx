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
});
