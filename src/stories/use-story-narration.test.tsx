import { act, renderHook, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useStoryNarration } from "@/stories/use-story-narration";
import type { StoryScene } from "@/stories/story-model";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function harness() {
  const start = vi.fn(),
    stop = vi.fn();
  const resume = vi.fn(async () => undefined);
  vi.stubGlobal(
    "AudioContext",
    class {
      destination = {};
      resume = resume;
      close = vi.fn(async () => undefined);
      decodeAudioData = vi.fn(async () => ({ duration: 5 }));
      createBufferSource = () => ({
        buffer: null,
        start,
        stop,
        connect: vi.fn(),
        disconnect: vi.fn(),
      });
    },
  );
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === "POST"
      ? new Response(JSON.stringify({ state: "ready", version: "v1" }), {
          status: 200,
        })
      : new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return { start, stop, resume, fetchMock };
}
const scene = (id: string, narration: string | null) =>
  ({ id, narration }) as StoryScene;

describe("cached story narration", () => {
  it("preloads once, uses one toggle, and reuses decoded audio on repeated navigation", async () => {
    const h = harness();
    const scenes = [scene("a", "First script"), scene("b", "Second script")];
    const { result, rerender } = renderHook(
      ({ active }) => useStoryNarration("canvas", scenes, active),
      { initialProps: { active: "a" } },
    );
    await waitFor(() =>
      expect(result.current.status).toBe("AI narration ready"),
    );
    expect(h.fetchMock).toHaveBeenCalledTimes(4);
    expect(h.start).not.toHaveBeenCalled();
    await act(() => result.current.toggle());
    expect(h.start).toHaveBeenCalledTimes(1);
    rerender({ active: "b" });
    rerender({ active: "a" });
    expect(h.start).toHaveBeenCalledTimes(3);
    expect(h.fetchMock).toHaveBeenCalledTimes(4);
    await act(() => result.current.toggle());
    expect(result.current.enabled).toBe(false);
    expect(h.stop).toHaveBeenCalled();
  });

  it("invalidates only edited narration and stops when narration is removed", async () => {
    const h = harness();
    const { result, rerender } = renderHook(
      ({ scenes }) => useStoryNarration("canvas", scenes, "a"),
      { initialProps: { scenes: [scene("a", "Original")] } },
    );
    await waitFor(() =>
      expect(result.current.status).toBe("AI narration ready"),
    );
    await act(() => result.current.toggle());
    rerender({ scenes: [scene("a", "Changed")] });
    await waitFor(() => expect(h.fetchMock).toHaveBeenCalledTimes(4));
    await waitFor(() =>
      expect(result.current.status).toBe("AI narration ready"),
    );
    const plays = h.start.mock.calls.length;
    rerender({ scenes: [scene("a", null)] });
    expect(result.current.status).toBe("No narration yet");
    expect(h.start).toHaveBeenCalledTimes(plays);
    expect(h.stop).toHaveBeenCalled();
  });
});
