import {
  act,
  fireEvent,
  render,
  screen,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { AnimatePresence } from "motion/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SceneCaption,
  captionScreenBounds,
  captionWorldBounds,
} from "./scene-caption";
import type { StoryScene } from "@/stories/story-model";
afterEach(cleanup);
describe("scene caption placement", () => {
  it("retains an inert outgoing caption until its fade completes", async () => {
    const caption = (
      <SceneCaption
        scene={
          { id: "a", title: "Opening", narration: "Fade me" } as StoryScene
        }
        viewport={{ x: 0, y: 0, scale: 1 }}
        size={{ width: 1000, height: 800 }}
        editable
        onSave={async () => true}
      />
    );
    const { rerender } = render(<AnimatePresence>{caption}</AnimatePresence>);
    const bubble = screen.getByTestId("story-caption-overlay");
    await waitFor(() => expect(bubble).toHaveStyle({ opacity: "1" }));
    rerender(<AnimatePresence>{null}</AnimatePresence>);
    expect(bubble).toBeInTheDocument();
    expect(bubble).toHaveAttribute("inert");
    expect(bubble).toHaveAttribute("aria-hidden", "true");
    await waitFor(() => expect(bubble).not.toBeInTheDocument());
  });
  it("hugs unsized text and measures its real bounds before the first author move", async () => {
    const onSave = vi.fn(async () => true);
    render(
      <SceneCaption
        scene={
          {
            id: "a",
            title: "Opening",
            narration: "Short caption",
          } as StoryScene
        }
        viewport={{ x: 0, y: 0, scale: 1 }}
        size={{ width: 1000, height: 800 }}
        editable
        onSave={onSave}
      />,
    );
    const bubble = screen.getByRole("complementary");
    expect(bubble).toHaveStyle({
      width: "max-content",
      height: "auto",
      maxWidth: "320px",
    });
    Object.defineProperties(bubble, {
      offsetWidth: { value: 200 },
      offsetHeight: { value: 56 },
    });
    const move = screen.getByRole("button", { name: "Move narration bubble" });
    expect(move).toHaveClass(
      "opacity-0",
      "group-hover/caption:opacity-100",
      "focus-visible:opacity-100",
    );
    expect(
      screen.getByRole("button", { name: "Resize narration bubble" }),
    ).toHaveClass("opacity-0", "group-hover/caption:opacity-100");
    await act(async () => fireEvent.keyDown(move, { key: "ArrowRight" }));
    expect(onSave).toHaveBeenCalledWith({
      x: 405,
      y: 654,
      width: 200,
      height: 56,
    });
  });
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
