import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/database.types";
import { subscribeToComments } from "./comment-realtime";

function fixture() {
  let invalidate = () => {};
  const channel = {
    on: vi.fn((_kind, _filter, listener) => {
      invalidate = listener;
      return channel;
    }),
    subscribe: vi.fn((listener) => {
      listener("SUBSCRIBED");
      return channel;
    }),
  };
  const client = {
    channel: vi.fn(() => channel),
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: "test" } },
      })),
    },
    realtime: { setAuth: vi.fn(async () => {}) },
    removeChannel: vi.fn(async () => "ok"),
  };
  return { client, channel, invalidate: () => invalidate() };
}

describe("shared comment realtime", () => {
  it("shares one subscription and keeps the remaining consumer alive on close", async () => {
    const { client, channel, invalidate } = fixture();
    const canvas = vi.fn();
    const document = vi.fn();
    const [first, second] = await Promise.all([
      subscribeToComments(
        client as unknown as SupabaseClient<Database>,
        "canvas",
        canvas,
      ),
      subscribeToComments(
        client as unknown as SupabaseClient<Database>,
        "canvas",
        document,
      ),
    ]);
    expect(client.channel).toHaveBeenCalledTimes(1);
    expect(channel.subscribe).toHaveBeenCalledTimes(1);
    invalidate();
    expect(canvas).toHaveBeenCalledTimes(1);
    expect(document).toHaveBeenCalledTimes(1);
    await second.unsubscribe();
    invalidate();
    expect(canvas).toHaveBeenCalledTimes(2);
    expect(document).toHaveBeenCalledTimes(1);
    expect(client.removeChannel).not.toHaveBeenCalled();
    await first.unsubscribe();
    await first.unsubscribe();
    expect(client.removeChannel).toHaveBeenCalledTimes(1);
    const reopened = await subscribeToComments(
      client as unknown as SupabaseClient<Database>,
      "canvas",
      document,
    );
    expect(channel.subscribe).toHaveBeenCalledTimes(2);
    await reopened.unsubscribe();
  });

  it("removes a failed connection so a later mount can reconnect", async () => {
    const { client, channel } = fixture();
    channel.subscribe.mockImplementationOnce((listener) => {
      listener("CHANNEL_ERROR");
      return channel;
    });
    await expect(
      subscribeToComments(
        client as unknown as SupabaseClient<Database>,
        "canvas",
        vi.fn(),
      ),
    ).rejects.toThrow("CHANNEL_ERROR");
    expect(client.removeChannel).toHaveBeenCalledTimes(1);
    const reopened = await subscribeToComments(
      client as unknown as SupabaseClient<Database>,
      "canvas",
      vi.fn(),
    );
    await reopened.unsubscribe();
    expect(channel.subscribe).toHaveBeenCalledTimes(2);
  });
});
