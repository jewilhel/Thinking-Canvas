import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  load: vi.fn(async () => []),
  loadCollaboration: vi.fn(async () => null),
  subscribe: vi.fn(async () => async () => {}),
  broadcastInvalidated: vi.fn(async () => {}),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/comments/supabase-comment-repository", () => ({
  SupabaseCommentRepository: class {
    constructor() {
      return repository;
    }
  },
}));

import { useCanvasComments } from "@/comments/use-canvas-comments";

describe("comment operation errors", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("explains an expired preview session rather than blaming the AI", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("<html>Login Redirect</html>", { status: 401 }),
      ),
    );
    const { result } = renderHook(() =>
      useCanvasComments("canvas", "https://example.test", "key"),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.retryAiRun("run"));
    expect(result.current.error).toContain("access has expired");
    await act(() => result.current.refresh());
    expect(result.current.error).toContain("access has expired");
  });
  it("keeps a failed retry visible after a successful background refresh", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "Retry was denied." }), {
            status: 403,
          }),
      ),
    );
    const { result } = renderHook(() =>
      useCanvasComments("canvas", "https://example.test", "key"),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.retryAiRun("run"));
    expect(result.current.error).toBe("Retry was denied.");
    await act(() => result.current.refresh());
    expect(result.current.error).toBe("Retry was denied.");
  });
});
