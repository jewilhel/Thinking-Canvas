import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readVoiceAvailability,
  useVoiceAvailability,
} from "./use-voice-availability";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const ready = () => Response.json({ enabled: true, build: "test" });

describe("voice availability recovery", () => {
  it("retries a temporary gateway failure without requiring a page refresh", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("Bad gateway", { status: 502 }))
      .mockResolvedValueOnce(ready());
    vi.stubGlobal("fetch", fetch);
    expect(
      await readVoiceAvailability("canvas", new AbortController().signal),
    ).toMatchObject({ enabled: true });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
  });
  it.each([401, 403])(
    "does not retry or bypass an authorization rejection (%s)",
    async (status) => {
      const fetch = vi
        .fn()
        .mockResolvedValue(Response.json({ error: "denied" }, { status }));
      vi.stubGlobal("fetch", fetch);
      const result = await readVoiceAvailability(
        "canvas",
        new AbortController().signal,
      );
      expect(result.enabled).toBe(false);
      expect(result.reason).toContain(
        status === 401 ? "sign in" : "editor access",
      );
      expect(fetch).toHaveBeenCalledOnce();
    },
  );
  it("bounds network retries and does not guess that preview access expired", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.stubGlobal("fetch", fetch);
    const result = await readVoiceAvailability(
      "canvas",
      new AbortController().signal,
    );
    expect(result.reason).toContain("temporarily unavailable");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("rechecks a stale denial on demand and clears its displayed error after recovery", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ error: "denied" }, { status: 403 }),
      )
      .mockResolvedValueOnce(ready());
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() => useVoiceAvailability("canvas"));
    await waitFor(() =>
      expect(result.current.availability.reason).toContain("editor access"),
    );
    act(() => result.current.setAccessError("Earlier denial"));
    await act(async () => {
      await result.current.check();
    });
    expect(result.current.availability.enabled).toBe(true);
    expect(result.current.accessError).toBe("");
  });
  it("coalesces concurrent checks and cancels pending work on unmount", async () => {
    let signal!: AbortSignal;
    const fetch = vi.fn(
      (_url, options) =>
        new Promise<Response>((_resolve, reject) => {
          signal = options.signal;
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const { result, unmount } = renderHook(() =>
      useVoiceAvailability("canvas"),
    );
    const first = result.current.check();
    expect(result.current.check()).toBe(first);
    unmount();
    await first;
    expect(signal.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();
  });
});
