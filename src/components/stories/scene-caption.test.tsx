import {
  act,
  fireEvent,
  render,
  screen,
  cleanup,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SceneCaption,
  captionScreenBounds,
  captionWorldBounds,
} from "./scene-caption";
import type { StoryScene } from "@/stories/story-model";
afterEach(cleanup);
describe("scene caption placement", () => {
  it("round-trips layout in world coordinates as the camera moves", () => {
    const layout = { x: 20, y: 40, width: 300, height: 100 };
    const viewport = { x: -100, y: 60, scale: 2 };
    const screen = captionScreenBounds(layout, viewport, {
      width: 1000,
      height: 800,
    });
    expect(screen).toEqual({ x: -60, y: 140, width: 600, height: 200 });
    expect(captionWorldBounds(screen, viewport)).toEqual(layout);
  });
  it("saves author movement/resize and wraps text inside a scrollable bubble", async () => {
    const onSave = vi.fn(async () => true);
    render(
      <SceneCaption
        scene={
          {
            id: "a",
            title: "Opening",
            narration: "A long scene script",
            captionLayout: { x: 100, y: 100, width: 300, height: 100 },
          } as StoryScene
        }
        viewport={{ x: 0, y: 0, scale: 1 }}
        size={{ width: 1000, height: 800 }}
        editable
        onSave={onSave}
      />,
    );
    await act(async () =>
      fireEvent.keyDown(
        screen.getByRole("button", { name: "Move narration bubble" }),
        { key: "ArrowRight" },
      ),
    );
    expect(onSave).toHaveBeenCalledWith({
      x: 105,
      y: 100,
      width: 300,
      height: 100,
    });
    await act(async () =>
      fireEvent.keyDown(
        screen.getByRole("button", { name: "Resize narration bubble" }),
        { key: "ArrowDown" },
      ),
    );
    expect(onSave).toHaveBeenLastCalledWith({
      x: 100,
      y: 100,
      width: 300,
      height: 105,
    });
    expect(screen.getByText("A long scene script")).toHaveClass(
      "overflow-auto",
      "whitespace-pre-wrap",
    );
  });
});
