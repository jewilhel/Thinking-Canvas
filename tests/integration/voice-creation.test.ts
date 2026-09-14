/* eslint-disable @typescript-eslint/no-explicit-any -- Integration adapters wrap the real database clients. */
// @vitest-environment node
import { vi, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
const h = vi.hoisted(() => ({
  client: null as any,
  service: null as any,
  user: null as any,
  task: "",
  calls: [] as string[],
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({
  getAuthenticatedUser: async () => h.user,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => h.client,
  createServiceClient: () => ({
    from: (table: string) => h.service.from(table),
    rpc: (name: string, args: any) => {
      h.calls.push(name);
      return h.service.rpc(name, args);
    },
  }),
}));
vi.mock("@/ai/realtime-broadcast", () => ({
  broadcastAiCanvasUpdate: async () => {},
}));
vi.mock("@/ai/render-capture", () => ({
  renderTargetedCanvasCapture: async () => {
    throw new Error("No capture in integration");
  },
}));
import * as Y from "yjs";
import { getProductDocumentContentRoot } from "../../src/documents/product-document";
import {
  createProductCanvasDocument,
  listCanvasObjectsV2,
} from "../../src/canvas/canvas-document";
import { completeAiRun } from "../../src/ai/collaborator-run-service";
it.skipIf(process.env.RUN_VOICE_DB_TESTS !== "1").each(["transcript", "shape"])(
  "creates %s through the guarded voice workflow",
  async (kind) => {
    const env = JSON.parse(
      execFileSync("pnpm", ["exec", "supabase", "status", "--output", "json"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
    h.client = createClient(env.API_URL, env.PUBLISHABLE_KEY, {
      auth: { persistSession: false },
    });
    h.service = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const auth = await h.client.auth.signInWithPassword({
      email: "owner@thinking-canvas.local",
      password: "LocalPassword1!",
    });
    h.user = auth.data.user;
    const c = { data: { id: crypto.randomUUID() } };
    execFileSync(
      "docker",
      [
        "exec",
        "supabase_db_thinking-canvas",
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-c",
        `insert into public.canvases(id,owner_id,title) values ('${c.data.id}','${h.user.id}','Voice creation pipeline fixture')`,
      ],
      { stdio: "ignore" },
    );
    const state = Y.encodeStateAsUpdate(createProductCanvasDocument(c.data.id));
    const initial = await h.client.rpc("append_canvas_update", {
      target_canvas_id: c.data.id,
      client_update_id: crypto.randomUUID(),
      update_data: "\\x" + Buffer.from(state).toString("hex"),
    });
    if (initial.error) throw initial.error;
    const sessionId = crypto.randomUUID();
    const session = await h.service.rpc("reserve_live_voice_test", {
      target_canvas: c.data.id,
      target_id: sessionId,
      target_user: h.user.id,
    });
    if (session.error) throw session.error;
    await h.service
      .from("voice_test_sessions")
      .update({
        supervisor_ready: true,
        heartbeat_at: new Date().toISOString(),
      })
      .eq("id", sessionId);
    const task = await h.service.rpc("reserve_voice_delegation", {
      target_session: sessionId,
      target_delegation: "fixture",
    });
    if (task.error) throw task.error;
    h.task = task.data.id;
    const r = await h.client.rpc("create_comment_thread", {
      target_canvas_id: c.data.id,
      target_client_command_id: h.task,
      target_body: "Canvas assistance requested during live voice.",
      target_anchor_x: 0,
      target_anchor_y: 0,
      target_include_primary_ai: true,
    });
    if (r.error) throw r.error;
    await h.service
      .from("voice_delegations")
      .update({ ai_run_id: r.data[0].ai_run_id })
      .eq("id", h.task);
    try {
      const result = await completeAiRun(
        { runId: r.data[0].ai_run_id, canvasId: c.data.id },
        {
          voiceTaskId: h.task,
          voiceConversation: JSON.stringify({
            fragments: [
              {
                speaker: "user",
                text: "Create a document with the partial transcript.",
              },
            ],
          }),
          beforeComplete: async () => {},
          gateway: {
            request: async () => ({
              status: "completed",
              requestId: "fixture",
              reply: {
                body: "Creating the document.",
                evidence: [],
                contextualTargetObjectIds: [],
              },
              toolCalls: [
                kind === "transcript"
                  ? {
                      callKey: "create-doc",
                      toolName: "create_conversation_document",
                      arguments: {
                        kind: "transcript",
                        title: "Test transcript",
                        text: "",
                      },
                    }
                  : {
                      callKey: "create-shape",
                      toolName: "stage_new_shapes",
                      arguments: {
                        summary: "Create a labeled sticky.",
                        shapes: [
                          {
                            key: "sticky",
                            shape: "rectangle",
                            text: "Voice creation test",
                            x: 0,
                            y: 0,
                            width: 100,
                            height: 24,
                            fill: "#ffffff",
                            outline: "#18181b",
                            outlineWidth: 1,
                            fontFamily: "Inter",
                            fontSize: 16,
                            fontWeight: "normal",
                            textAlign: "center",
                            textColor: "#ffffff",
                          },
                        ],
                        explanations: [
                          {
                            key: "sticky",
                            whatChanged: "Created a labeled sticky.",
                            why: "Requested by the user.",
                          },
                        ],
                      },
                    },
              ],
            }),
          } as any,
        },
      );
      expect(result.status).toBe("completed");
      expect(result.changeSetId).toBeTruthy();
      const updates = await h.client
        .from("canvas_updates")
        .select("update_data")
        .eq("canvas_id", c.data.id)
        .order("sequence");
      if (updates.error) throw updates.error;
      const restored = new Y.Doc();
      for (const update of updates.data)
        Y.applyUpdate(
          restored,
          Buffer.from(update.update_data.slice(2), "hex"),
        );
      const objects = listCanvasObjectsV2(restored);
      expect(objects).toHaveLength(1);
      expect(objects[0].type).toBe(
        kind === "transcript" ? "document" : "shape",
      );
      if (kind === "transcript")
        expect(
          JSON.stringify(
            getProductDocumentContentRoot(restored, objects[0].id).toJSON(),
          ),
        ).toContain("Create a document with the partial transcript.");
      else {
        if (objects[0].type !== "shape") throw new Error("Expected a shape");
        expect(objects[0].text).toBe("Voice creation test");
      }
    } catch (e) {
      console.log("RPC checkpoints", h.calls);
      throw e;
    } finally {
      await h.service.rpc("finish_voice_delegation", {
        target_id: h.task,
        target_status: "completed",
        target_units: 0,
      });
      await h.service.rpc("finish_live_voice_test", {
        target_id: sessionId,
        target_reason: "fixture",
        target_rejected: true,
      });
    }
  },
  30000,
);
