import { afterEach, expect, it, vi } from "vitest";
import { scheduleVoiceGoodbye } from "./voice-goodbye";
afterEach(() => vi.useRealTimers());
it("resumes during the goodbye period without replaying earlier announcements", () => {
  vi.useFakeTimers();
  vi.setSystemTime(680_000);
  const say = vi.fn(),
    end = vi.fn();
  scheduleVoiceGoodbye({ wrapUpAt: 600_000, expiresAt: 720_000, say, end });
  vi.advanceTimersByTime(0);
  expect(say).toHaveBeenCalledOnce();
  expect(say.mock.calls[0][0]).toContain("final minute");
  vi.advanceTimersByTime(40_000);
  expect(say).toHaveBeenCalledTimes(2);
  expect(end).toHaveBeenCalledOnce();
});
it("preserves the original hard deadline of calls without a goodbye period", () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const say = vi.fn(),
    end = vi.fn();
  scheduleVoiceGoodbye({ expiresAt: 600_000, say, end });
  vi.advanceTimersByTime(540_000);
  expect(say).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(60_000);
  expect(end).toHaveBeenCalledOnce();
});
it("winds down at ten minutes, becomes firmer, says goodbye, and ends at twelve", () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const say = vi.fn(),
    end = vi.fn();
  scheduleVoiceGoodbye({ wrapUpAt: 600_000, expiresAt: 720_000, say, end });
  vi.advanceTimersByTime(599_999);
  expect(say).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(say).toHaveBeenCalledTimes(1);
  expect(end).not.toHaveBeenCalled();
  vi.advanceTimersByTime(60_000);
  expect(say).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(45_000);
  expect(say).toHaveBeenCalledTimes(3);
  expect(end).not.toHaveBeenCalled();
  vi.advanceTimersByTime(15_000);
  expect(end).toHaveBeenCalledOnce();
});
it("cancels every pending goodbye when the session ends early", () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const say = vi.fn(),
    end = vi.fn();
  const clear = scheduleVoiceGoodbye({
    wrapUpAt: 600_000,
    expiresAt: 720_000,
    say,
    end,
  });
  clear();
  vi.advanceTimersByTime(800_000);
  expect(say).not.toHaveBeenCalled();
  expect(end).not.toHaveBeenCalled();
});
