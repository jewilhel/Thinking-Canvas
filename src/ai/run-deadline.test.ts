import { describe, expect, it, vi } from "vitest";

import {
  AiRunTimeoutError,
  createAiRunDeadlineSignal,
  throwIfAiRunAborted,
} from "@/ai/run-deadline";

describe("AI run deadline", () => {
  it("aborts a slow run with a distinguishable timeout", () => {
    vi.useFakeTimers();
    const parent = new AbortController();
    const deadline = createAiRunDeadlineSignal(parent.signal, 75);
    vi.advanceTimersByTime(75);
    expect(() => throwIfAiRunAborted(deadline.signal)).toThrow(
      AiRunTimeoutError,
    );
    deadline.dispose();
    vi.useRealTimers();
  });

  it("maps an upstream cancellation to an abort error", () => {
    const parent = new AbortController();
    const deadline = createAiRunDeadlineSignal(parent.signal, 75_000);
    const reason = new DOMException("Cancelled by caller.", "AbortError");
    parent.abort(reason);
    let thrown: unknown;
    try {
      throwIfAiRunAborted(deadline.signal);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({
      name: "AbortError",
      message: "The AI run was interrupted.",
    });
    deadline.dispose();
  });
});
