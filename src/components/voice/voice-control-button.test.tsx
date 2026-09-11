import {
  act,
  fireEvent,
  render,
  screen,
  cleanup,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VoiceControlButton } from "./voice-control-button";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function setup(active = false) {
  const onAction = vi.fn(),
    onSettings = vi.fn();
  render(
    <VoiceControlButton
      active={active}
      connecting={false}
      muted={false}
      status={active ? "Connected" : "Ended"}
      settingsOpen={false}
      onAction={onAction}
      onSettings={onSettings}
    />,
  );
  return { button: screen.getByRole("button"), onAction, onSettings };
}
describe("single voice control", () => {
  it("opens settings without starting or ending a session for either modifier", () => {
    const { button, onAction, onSettings } = setup(true);
    fireEvent.click(button, { metaKey: true });
    fireEvent.click(button, { ctrlKey: true });
    fireEvent.contextMenu(button);
    fireEvent.keyDown(button, { key: "F10", shiftKey: true });
    expect(onSettings).toHaveBeenCalledTimes(4);
    expect(onAction).not.toHaveBeenCalled();
  });
  it("uses the same button for an ordinary session action", () => {
    const { button, onAction, onSettings } = setup(true);
    expect(button.getAttribute("aria-label")).toBe("End AI voice");
    fireEvent.click(button);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onSettings).not.toHaveBeenCalled();
  });
  it("suppresses the click following a touch long press", () => {
    vi.useFakeTimers();
    const { button, onAction, onSettings } = setup();
    const down = new Event("pointerdown", { bubbles: true });
    Object.assign(down, { pointerType: "touch", clientX: 10, clientY: 10 });
    fireEvent(button, down);
    act(() => vi.advanceTimersByTime(550));
    fireEvent.pointerUp(button);
    fireEvent.click(button);
    expect(onSettings).toHaveBeenCalledTimes(1);
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
