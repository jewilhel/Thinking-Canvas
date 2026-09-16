// @vitest-environment node
import OpenAI from "openai";
import { afterEach, expect, it, vi } from "vitest";
import { VOICE_CANVAS_TIMEOUT_MS } from "./live-delegation-contract";
afterEach(() => vi.useRealTimers());
it("allows a 20-second canvas response through the client's shorter connection timeout", async () => {
  vi.useFakeTimers();
  const transport = vi.fn(
    (_url: unknown, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(
          () =>
            resolve(
              new Response(
                JSON.stringify({ id: "response-test", output: [] }),
                { headers: { "content-type": "application/json" } },
              ),
            ),
          20000,
        );
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        });
      }),
  );
  const client = new OpenAI({
    apiKey: "synthetic-test-key",
    timeout: 15000,
    maxRetries: 0,
    fetch: transport as typeof fetch,
  });
  const result = client.responses.create(
    { model: "synthetic-model", input: "test" },
    { timeout: VOICE_CANVAS_TIMEOUT_MS },
  );
  await vi.waitFor(() => expect(transport).toHaveBeenCalledOnce());
  await vi.advanceTimersByTimeAsync(20000);
  await expect(result).resolves.toMatchObject({ id: "response-test" });
});
