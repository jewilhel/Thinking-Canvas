import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useSavedVoiceSettings } from "./use-saved-voice-settings";
import { DEFAULT_LIVE_SETTINGS } from "./live-protocol";
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});
it("restores all instructions after a fresh mount without relying on browser storage", async () => {
  let saved: unknown = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      if (options?.method === "PUT") {
        saved = JSON.parse(options.body);
        return new Response(null, { status: 204 });
      }
      return Response.json({ settings: saved });
    }),
  );
  const first = renderHook(() => useSavedVoiceSettings("owner"));
  await waitFor(() => expect(first.result.current.ready).toBe(true));
  act(() =>
    first.result.current.setDraft({
      ...DEFAULT_LIVE_SETTINGS,
      greeting: "Welcome back",
      instructions: "Let me finish",
      goodbye: "End warmly",
    }),
  );
  await waitFor(() =>
    expect(first.result.current.notice).toBe("Saved to your account"),
  );
  first.unmount();
  localStorage.clear();
  const next = renderHook(() => useSavedVoiceSettings("owner"));
  await waitFor(() => expect(next.result.current.ready).toBe(true));
  expect(next.result.current.draft).toMatchObject({
    greeting: "Welcome back",
    instructions: "Let me finish",
    goodbye: "End warmly",
  });
});
it("recovers an unsynced local draft after an immediate refresh", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ settings: null })),
  );
  const first = renderHook(() => useSavedVoiceSettings("owner"));
  await waitFor(() => expect(first.result.current.ready).toBe(true));
  act(() =>
    first.result.current.setDraft({
      ...DEFAULT_LIVE_SETTINGS,
      greeting: "Keep this",
    }),
  );
  first.unmount();
  const next = renderHook(() => useSavedVoiceSettings("owner"));
  await waitFor(() =>
    expect(next.result.current.draft.greeting).toBe("Keep this"),
  );
});
it("does not overwrite remote settings with defaults when loading fails", async () => {
  const fetcher = vi.fn(async () => new Response(null, { status: 503 }));
  vi.stubGlobal("fetch", fetcher);
  const hook = renderHook(() => useSavedVoiceSettings("owner"));
  await waitFor(() =>
    expect(hook.result.current.notice).toContain("Could not load"),
  );
  expect(hook.result.current.ready).toBe(false);
  act(() => hook.result.current.setDraft(DEFAULT_LIVE_SETTINGS));
  expect(fetcher).toHaveBeenCalledTimes(1);
});
