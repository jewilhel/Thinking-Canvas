"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

import {
  commentCommandSchema,
  compareChronologically,
  parsePromptResponse,
  type CommentCommand,
  type CommentPrompt,
  type CommentResponse,
  type CommentThread,
} from "@/comments/comment-model";
import type { Database, Json } from "@/lib/supabase/database.types";

type CommentRow = Database["public"]["Tables"]["comments"]["Row"];
type ReplyRow = Database["public"]["Tables"]["comment_replies"]["Row"];
type PromptRow = Database["public"]["Tables"]["comment_prompts"]["Row"];
type ResponseRow = Database["public"]["Tables"]["comment_responses"]["Row"];

function requireData<T>(data: T | null, error: { message: string } | null) {
  if (error) throw new Error(error.message);
  if (data === null) throw new Error("The comment request returned no data.");
  return data;
}

export class SupabaseCommentRepository {
  private channel: RealtimeChannel | null = null;

  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async load(canvasId: string): Promise<CommentThread[]> {
    const commentsResult = await this.supabase
      .from("comments")
      .select(
        "id,canvas_id,author_id,author_kind,author_key,body,status,anchor_x,anchor_y,created_at,updated_at",
      )
      .eq("canvas_id", canvasId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    const comments = requireData(
      commentsResult.data,
      commentsResult.error,
    ) as CommentRow[];
    if (!comments.length) return [];

    const commentIds = comments.map((comment) => comment.id);
    const [targetsResult, repliesResult, promptsResult] = await Promise.all([
      this.supabase
        .from("comment_targets")
        .select("id,comment_id,target_object_id,created_at")
        .in("comment_id", commentIds)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }),
      this.supabase
        .from("comment_replies")
        .select("id,comment_id,author_id,body,created_at,updated_at")
        .in("comment_id", commentIds)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }),
      this.supabase
        .from("comment_prompts")
        .select("id,comment_id,kind,minimum,maximum,created_at")
        .in("comment_id", commentIds),
    ]);
    const targets = requireData(targetsResult.data, targetsResult.error);
    const replies = requireData(
      repliesResult.data,
      repliesResult.error,
    ) as ReplyRow[];
    const prompts = requireData(
      promptsResult.data,
      promptsResult.error,
    ) as PromptRow[];
    const promptIds = prompts.map((prompt) => prompt.id);
    const responsesResult = promptIds.length
      ? await this.supabase
          .from("comment_responses")
          .select("id,prompt_id,responder_id,value,created_at,updated_at")
          .in("prompt_id", promptIds)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
      : { data: [] as ResponseRow[], error: null };
    const responses = requireData(
      responsesResult.data,
      responsesResult.error,
    ) as ResponseRow[];

    const profileIds = [
      ...comments.map((comment) => comment.author_id),
      ...replies.map((reply) => reply.author_id),
      ...responses.map((response) => response.responder_id),
    ].filter((id, index, values) => values.indexOf(id) === index);
    const profilesResult = await this.supabase
      .from("profiles")
      .select("id,display_name")
      .in("id", profileIds);
    const profiles = requireData(profilesResult.data, profilesResult.error);
    const profileNames = new Map(
      profiles.map((profile) => [profile.id, profile.display_name]),
    );

    const responsesByPrompt = new Map<string, CommentResponse[]>();
    for (const row of responses) {
      const prompt = prompts.find(
        (candidate) => candidate.id === row.prompt_id,
      );
      if (!prompt) continue;
      const response: CommentResponse = {
        id: row.id,
        responderId: row.responder_id,
        responderName: profileNames.get(row.responder_id) ?? "Participant",
        value: parsePromptResponse(prompt.kind, row.value),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      const current = responsesByPrompt.get(row.prompt_id) ?? [];
      current.push(response);
      responsesByPrompt.set(row.prompt_id, current);
    }

    return comments.map((comment) => {
      const promptRow = prompts.find(
        (prompt) => prompt.comment_id === comment.id,
      );
      const prompt: CommentPrompt | null = promptRow
        ? {
            id: promptRow.id,
            kind: promptRow.kind,
            minimum: promptRow.minimum,
            maximum: promptRow.maximum,
            responses: (responsesByPrompt.get(promptRow.id) ?? []).sort(
              compareChronologically,
            ),
          }
        : null;
      return {
        id: comment.id,
        canvasId: comment.canvas_id,
        authorId: comment.author_id,
        authorKind: comment.author_kind,
        authorKey: comment.author_key,
        authorName:
          comment.author_kind === "ai"
            ? "Thinking Canvas AI"
            : (profileNames.get(comment.author_id) ?? "Participant"),
        body: comment.body,
        status: comment.status,
        createdAt: comment.created_at,
        updatedAt: comment.updated_at,
        targetObjectIds: targets
          .filter((target) => target.comment_id === comment.id)
          .map((target) => target.target_object_id),
        canvasAnchor:
          comment.anchor_x === null || comment.anchor_y === null
            ? null
            : { x: comment.anchor_x, y: comment.anchor_y },
        replies: replies
          .filter((reply) => reply.comment_id === comment.id)
          .map((reply) => ({
            id: reply.id,
            authorId: reply.author_id,
            authorName: profileNames.get(reply.author_id) ?? "Participant",
            body: reply.body,
            createdAt: reply.created_at,
            updatedAt: reply.updated_at,
          }))
          .sort(compareChronologically),
        prompt,
      } satisfies CommentThread;
    });
  }

  async execute(input: CommentCommand) {
    const command = commentCommandSchema.parse(input);
    if (command.type === "comment.create") {
      const args: Database["public"]["Functions"]["create_comment_thread"]["Args"] =
        {
          target_canvas_id: command.canvasId,
          target_client_command_id: command.commandId,
          target_body: command.body,
          target_object_ids: command.targetObjectIds,
          target_author_kind: command.authorKind,
          target_author_key: command.authorKey ?? undefined,
          target_anchor_x: command.canvasAnchor?.x ?? undefined,
          target_anchor_y: command.canvasAnchor?.y ?? undefined,
          target_prompt_kind: command.promptKind ?? undefined,
        };
      const result = await this.supabase.rpc("create_comment_thread", args);
      return requireData(result.data, result.error).at(0);
    }
    if (command.type === "comment.reply") {
      const result = await this.supabase.rpc("create_comment_reply", {
        target_comment_id: command.commentId,
        target_client_command_id: command.commandId,
        target_body: command.body,
      });
      return requireData(result.data, result.error).at(0);
    }
    if (command.type === "comment.respond") {
      const value = parsePromptResponse(command.promptKind, command.value);
      const result = await this.supabase.rpc("respond_to_comment_prompt", {
        target_prompt_id: command.promptId,
        target_client_command_id: command.commandId,
        target_value: value as Json,
      });
      return requireData(result.data, result.error).at(0);
    }
    if (command.type === "comment.prompt.set") {
      const result = await this.supabase.rpc("set_comment_prompt", {
        target_comment_id: command.commentId,
        target_prompt_kind: command.promptKind ?? undefined,
      });
      if (result.error) throw new Error(result.error.message);
      return result.data;
    }
    if (command.type === "comment.body.update") {
      const result = await this.supabase.rpc("update_comment_body", {
        target_comment_id: command.commentId,
        target_body: command.body,
      });
      return requireData(result.data, result.error);
    }
    if (command.type === "comment.status") {
      const result = await this.supabase.rpc("transition_comment_status", {
        target_comment_id: command.commentId,
        target_status: command.status,
      });
      return requireData(result.data, result.error);
    }
    const result = await this.supabase.rpc("delete_comment_thread", {
      target_comment_id: command.commentId,
    });
    return requireData(result.data, result.error);
  }

  async subscribe(canvasId: string, onInvalidated: () => void) {
    const { data } = await this.supabase.auth.getSession();
    if (!data.session) throw new Error("An authenticated session is required.");
    await this.supabase.realtime.setAuth(data.session.access_token);
    const channel = this.supabase.channel(`comments:${canvasId}`, {
      config: { private: true, broadcast: { ack: false, self: false } },
    });
    this.channel = channel;
    channel.on("broadcast", { event: "comments-invalidated" }, onInvalidated);
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
    return async () => {
      await this.supabase.removeChannel(channel);
      if (this.channel === channel) this.channel = null;
    };
  }

  async broadcastInvalidated() {
    return this.channel?.send({
      type: "broadcast",
      event: "comments-invalidated",
      payload: { kind: "comments-invalidated" },
    });
  }
}
