// @vitest-environment node
import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  db: null as SupabaseClient | null,
  userId: "",
}));
vi.mock("server-only", () => ({}));
vi.mock("@/voice/voice-server", () => ({
  authorizeVoice: async () => ({ id: state.userId }),
  voiceEnabled: () => true,
  voiceService: () => state.db,
  voiceProvider: vi.fn(),
  supervisorSignature: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({
  getAuthenticatedUser: async () => ({ id: state.userId }),
}));
import { GET } from "../../src/app/api/canvases/[canvasId]/voice/route";

it.skipIf(process.env.RUN_VOICE_DB_TESTS !== "1")(
  "retains a failed canvas task after later success, excludes ending checks, and scopes status to the canvas",
  async () => {
    const env = JSON.parse(
      execFileSync("pnpm", ["exec", "supabase", "status", "--output", "json"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
    const auth = createClient(env.API_URL, env.PUBLISHABLE_KEY, {
      auth: { persistSession: false },
    });
    const login = await auth.auth.signInWithPassword({
      email: "owner@thinking-canvas.local",
      password: "LocalPassword1!",
    });
    if (!login.data.user) throw new Error("Local fixture login failed");
    state.userId = login.data.user.id;
    const db = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    state.db = db;
    const sessionId = crypto.randomUUID();
    const canvasId = "20000000-0000-4000-8000-000000000001";
    const day = "2026-01-01";
    const seededDay = await db
      .from("voice_test_days")
      .upsert({ day }, { onConflict: "day", ignoreDuplicates: true });
    expect(seededDay.error).toBeNull();
    const session = await db.from("voice_test_sessions").insert({
      id: sessionId,
      canvas_id: canvasId,
      user_id: state.userId,
      day,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      reserved_cents: 100,
    });
    expect(session.error).toBeNull();
    try {
      const failureId = crypto.randomUUID();
      const base = Date.now() - 10_000;
      const tasks = await db.from("voice_delegations").insert(
        [
          [failureId, "native-request", "failed"],
          [crypto.randomUUID(), "control:ending-observer:test", "failed"],
          [crypto.randomUUID(), "control:ending:test", "failed"],
          [crypto.randomUUID(), "later-request", "completed"],
        ].map(([id, delegation_id, status], index) => ({
          id,
          session_id: sessionId,
          delegation_id,
          status,
          created_at: new Date(base + index * 1000).toISOString(),
          finished_at: new Date(base + index * 1000 + 100).toISOString(),
        })),
      );
      expect(tasks.error).toBeNull();
      const response = await GET(
        new Request(`http://localhost/voice?id=${sessionId}`),
        { params: Promise.resolve({ canvasId }) },
      );
      expect(response.status).toBe(200);
      const status = await response.json();
      expect(status.taskStatus).toBe("completed");
      expect(status.failedTaskId).toBe(failureId);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      const otherCanvas = await GET(
        new Request(`http://localhost/voice?id=${sessionId}`),
        { params: Promise.resolve({ canvasId: crypto.randomUUID() }) },
      );
      expect(otherCanvas.status).toBe(404);
      state.userId = crypto.randomUUID();
      const otherAccount = await GET(
        new Request(`http://localhost/voice?id=${sessionId}`),
        { params: Promise.resolve({ canvasId }) },
      );
      expect(otherAccount.status).toBe(404);
    } finally {
      await db.from("voice_delegations").delete().eq("session_id", sessionId);
      await db.from("voice_test_sessions").delete().eq("id", sessionId);
    }
  },
  15000,
);
