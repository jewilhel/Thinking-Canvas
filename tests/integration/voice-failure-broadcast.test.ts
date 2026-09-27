// @vitest-environment node
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { broadcastVoiceTaskFailure } from "../../src/voice/broadcast-task-failure";

it.skipIf(process.env.RUN_VOICE_DB_TESTS !== "1")(
  "delivers safe admission metadata over the existing private canvas topic",
  async () => {
    const env = JSON.parse(
      execFileSync("pnpm", ["exec", "supabase", "status", "--output", "json"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", env.API_URL);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", env.PUBLISHABLE_KEY);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", env.SERVICE_ROLE_KEY);
    const db = createClient(env.API_URL, env.PUBLISHABLE_KEY, {
      auth: { persistSession: false },
    });
    const login = await db.auth.signInWithPassword({
      email: "owner@thinking-canvas.local",
      password: "LocalPassword1!",
    });
    if (!login.data.session) throw new Error("Local fixture login failed");
    await db.realtime.setAuth(login.data.session.access_token);
    const canvasId = "20000000-0000-4000-8000-000000000001";
    const channel = db.channel(`canvas:${canvasId}`, {
      config: { private: true },
    });
    const received: unknown[] = [];
    channel.on("broadcast", { event: "voice-task-failed" }, ({ payload }) => {
      received.push(payload);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") resolve();
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
            reject(new Error(status));
        });
      });
      const notice = {
        sessionId: crypto.randomUUID(),
        id: "not-admitted",
        reason: "queue_full" as const,
      };
      await broadcastVoiceTaskFailure(canvasId, notice);
      await vi.waitFor(() => expect(received).toEqual([notice]), {
        timeout: 5000,
      });
      // A server notification must leave the existing subscriber available.
      expect(channel.state).toBe("joined");
    } finally {
      await db.removeChannel(channel);
      vi.unstubAllEnvs();
    }
  },
  20000,
);
