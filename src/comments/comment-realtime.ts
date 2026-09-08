import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

type Subscription = {
  channel: RealtimeChannel;
  listeners: Set<() => void>;
  ready: Promise<void>;
};

const subscriptions = new WeakMap<
  SupabaseClient<Database>,
  Map<string, Subscription>
>();

// Canvas history and an open document share a Supabase client and topic. The
// SDK returns the same channel for both, so only one owner may subscribe/remove.
export async function subscribeToComments(
  client: SupabaseClient<Database>,
  canvasId: string,
  onInvalidated: () => void,
) {
  let topics = subscriptions.get(client);
  if (!topics) {
    topics = new Map();
    subscriptions.set(client, topics);
  }
  let subscription = topics.get(canvasId);
  if (!subscription) {
    const channel = client.channel(`comments:${canvasId}`, {
      config: { private: true, broadcast: { ack: false, self: false } },
    });
    const listeners = new Set<() => void>();
    subscription = { channel, listeners, ready: Promise.resolve() };
    topics.set(canvasId, subscription);
    channel.on("broadcast", { event: "comments-invalidated" }, () => {
      for (const notify of listeners) notify();
    });
    subscription.ready = (async () => {
      const { data } = await client.auth.getSession();
      if (!data.session)
        throw new Error("An authenticated session is required.");
      await client.realtime.setAuth(data.session.access_token);
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(
          () => reject(new Error("Comment updates could not connect.")),
          10_000,
        );
        channel.subscribe((status, error) => {
          if (status === "SUBSCRIBED") {
            window.clearTimeout(timeout);
            resolve();
          } else if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            error
          ) {
            window.clearTimeout(timeout);
            reject(error ?? new Error(`Comment updates failed: ${status}`));
          }
        });
      });
    })().catch(async (error: unknown) => {
      if (topics.get(canvasId) === subscription) topics.delete(canvasId);
      await client.removeChannel(channel);
      throw error;
    });
  }
  // Use a distinct listener per consumer even when callback identities match.
  const notify = () => onInvalidated();
  subscription.listeners.add(notify);
  await subscription.ready;
  let released = false;
  return {
    channel: subscription.channel,
    unsubscribe: async () => {
      if (released) return;
      released = true;
      subscription.listeners.delete(notify);
      if (subscription.listeners.size === 0) {
        if (topics.get(canvasId) === subscription) topics.delete(canvasId);
        await client.removeChannel(subscription.channel);
      }
    },
  };
}
