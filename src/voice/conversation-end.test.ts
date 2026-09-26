import { describe, expect, it, vi } from "vitest";
import { ConversationEnd } from "./conversation-end";

describe("conversation ending", () => {
  it("waits for closing output and a quiet gap, then closes once", () => {
    const end = vi.fn();
    const closing = new ConversationEnd(end);
    closing.request(0);
    closing.tick(false, true, 12000);
    expect(end).not.toHaveBeenCalled();
    closing.output(13000);
    closing.tick(false, true, 15000);
    closing.tick(false, false, 17000);
    expect(end).not.toHaveBeenCalled();
    closing.tick(false, true, 17000);
    closing.tick(false, true, 18000);
    expect(end).toHaveBeenCalledOnce();
  });
  it("cancels for resumed conversation, pending work, or absent output", () => {
    for (const reason of ["speech", "task", "timeout"]) {
      const end = vi.fn();
      const closing = new ConversationEnd(end);
      closing.request(0);
      closing.output(1000);
      if (reason === "speech") closing.cancel();
      if (reason === "task") closing.tick(true, true, 12000);
      if (reason === "timeout") closing.tick(false, true, 61000);
      closing.tick(false, true, 65000);
      expect(end).not.toHaveBeenCalled();
    }
  });
});

it("retains the farewell spoken before approval and closes after a short gap", () => {
  const end = vi.fn();
  const closing = new ConversationEnd(end);
  closing.output(1000);
  closing.request(2000);
  closing.tick(false, true, 3499);
  expect(end).not.toHaveBeenCalled();
  closing.tick(false, true, 3500);
  expect(end).toHaveBeenCalledOnce();
});

it("does not reuse a farewell from before the participant resumed", () => {
  const end = vi.fn();
  const closing = new ConversationEnd(end);
  closing.output(1000);
  closing.cancel();
  closing.request(5000);
  closing.tick(false, true, 8000);
  expect(end).not.toHaveBeenCalled();
});

it("waits for the new spoken result when a final save was requested", () => {
  const end = vi.fn();
  const closing = new ConversationEnd(end);
  closing.output(1000);
  closing.request(5000, true);
  closing.tick(false, true, 9000);
  expect(end).not.toHaveBeenCalled();
  closing.output(9500);
  closing.tick(false, true, 12000);
  expect(end).toHaveBeenCalledOnce();
});

it("retains a natural farewell even when the handoff event follows it", () => {
  const end = vi.fn();
  const closing = new ConversationEnd(end);
  closing.output(1000);
  closing.pause();
  closing.request(5000);
  closing.tick(false, true, 5100);
  expect(end).toHaveBeenCalledOnce();
});
