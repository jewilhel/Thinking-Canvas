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
  putCanvasObjectV2,
  migrateLegacyShapeLabels,
  projectCanvasCompositions,
} from "../../src/canvas/canvas-document";
import { completeAiRun } from "../../src/ai/collaborator-run-service";
it
  .skipIf(process.env.RUN_VOICE_DB_TESTS !== "1")
  .each(["transcript", "shape", "direct-edit", "clarification"])(
  "creates %s through the guarded voice workflow",
  async (kind) => {
    h.calls = [];
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
    const initialDocument = createProductCanvasDocument(c.data.id);
    const existingId = crypto.randomUUID();
    if (kind === "direct-edit")
      putCanvasObjectV2(initialDocument, {
        schemaVersion: 2,
        id: existingId,
        canvasId: c.data.id,
        createdBy: h.user.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        type: "shape",
        shape: "rectangle",
        text: "Voice creation test",
        geometry: { x: 0, y: 0, width: 220, height: 80, rotation: 0 },
        style: {
          fill: "#ffffff",
          outline: "#18181b",
          outlineWidth: 1,
          fontFamily: "Inter",
          fontSize: 16,
          fontWeight: "normal",
          textAlign: "center",
          textColor: "#18181b",
        },
      });
    if (kind === "direct-edit") migrateLegacyShapeLabels(initialDocument);
    const state = Y.encodeStateAsUpdate(initialDocument);
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
                kind === "clarification"
                  ? {
                      callKey: "clarify",
                      toolName: "ask_voice_clarification",
                      arguments: { question: "Which shape should I change?" },
                    }
                  : kind === "direct-edit"
                    ? {
                        callKey: "direct-edit",
                        toolName: "execute_canvas_commands",
                        arguments: {
                          commands: [
                            {
                              type: "object.style",
                              payload: {
                                objectId: existingId,
                                style: {
                                  fill: "#fefefe",
                                  textColor: "#ffffff",
                                },
                              },
                            },
                          ],
                        },
                      }
                    : kind === "transcript"
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
                ...(kind === "clarification"
                  ? [
                      {
                        callKey: "must-not-run",
                        toolName: "manage_comment_thread",
                        arguments: {
                          action: "create",
                          commentId: null,
                          body: "Must not save while asking for clarification.",
                        },
                      },
                    ]
                  : []),
                ...(kind === "shape"
                  ? [
                      {
                        callKey: "extra-document",
                        toolName: "create_conversation_document",
                        arguments: {
                          kind: "document",
                          title: "Alongside the shape",
                          text: "Requested document body.",
                        },
                      },
                      {
                        callKey: "comment",
                        toolName: "manage_comment_thread",
                        arguments: {
                          action: "create",
                          commentId: null,
                          body: "Created the requested shape.",
                        },
                      },
                    ]
                  : []),
              ],
            }),
          } as any,
        },
      );
      expect(result.status).toBe("completed");
      if (kind === "clarification") {
        expect(
          "clarificationQuestion" in result && result.clarificationQuestion,
        ).toBe("Which shape should I change?");
        expect(result.changeSetId).toBeNull();
        expect(h.calls).not.toContain("manage_voice_comment");
        expect(h.calls).not.toContain("stage_ai_canvas_changes");
        const unchanged = await h.client
          .from("canvas_updates")
          .select("sequence")
          .eq("canvas_id", c.data.id);
        expect(unchanged.data).toHaveLength(1);
        return;
      }
      expect(result.changeSetId).toBeTruthy();
      if (kind === "direct-edit") {
        const saved = await h.client
          .from("ai_change_sets")
          .select("visual_feedback_metadata")
          .eq("id", result.changeSetId)
          .single();
        expect(saved.error).toBeNull();
        expect(saved.data.visual_feedback_metadata.feedbackStatus).toBe(
          "advisory",
        );
        expect(
          saved.data.visual_feedback_metadata.feedbackIssueCount,
        ).toBeGreaterThan(0);
      }
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
      const objects = projectCanvasCompositions(listCanvasObjectsV2(restored));
      expect(objects).toHaveLength(kind === "shape" ? 2 : 1);
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
        expect(objects[0].style.textColor).toBe("#ffffff");
      }
      if (kind === "direct-edit") {
        await h.service.rpc("finish_voice_delegation", {
          target_id: h.task,
          target_status: "completed",
          target_units: 0,
        });
        const undoTask = await h.service.rpc("reserve_voice_delegation", {
          target_session: sessionId,
          target_delegation: "undo-fixture",
        });
        if (undoTask.error) throw undoTask.error;
        h.task = undoTask.data.id;
        const undoRun = await h.client.rpc("create_comment_thread", {
          target_canvas_id: c.data.id,
          target_client_command_id: h.task,
          target_body: "Canvas assistance requested during live voice.",
          target_anchor_x: 0,
          target_anchor_y: 0,
          target_include_primary_ai: true,
        });
        if (undoRun.error) throw undoRun.error;
        await h.service
          .from("voice_delegations")
          .update({ ai_run_id: undoRun.data[0].ai_run_id })
          .eq("id", h.task);
        const undone = await completeAiRun(
          { runId: undoRun.data[0].ai_run_id, canvasId: c.data.id },
          {
            voiceTaskId: h.task,
            voiceConversation: JSON.stringify({
              fragments: [{ speaker: "user", text: "Undo that change." }],
            }),
            beforeComplete: async () => {},
            gateway: {
              request: async () => ({
                status: "completed",
                requestId: "undo-fixture",
                reply: {
                  body: "Undoing that edit.",
                  evidence: [],
                  contextualTargetObjectIds: [],
                },
                toolCalls: [
                  {
                    callKey: "undo",
                    toolName: "undo_last_ai_change",
                    arguments: {},
                  },
                ],
              }),
            } as any,
          },
        );
        expect(undone.status).toBe("completed");
        const afterUndo = await h.client
          .from("canvas_updates")
          .select("update_data")
          .eq("canvas_id", c.data.id)
          .order("sequence");
        for (const update of afterUndo.data)
          Y.applyUpdate(
            restored,
            Buffer.from(update.update_data.slice(2), "hex"),
          );
        expect(
          projectCanvasCompositions(listCanvasObjectsV2(restored))[0].style
            .textColor,
        ).toBe("#18181b");
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
