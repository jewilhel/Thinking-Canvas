"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

import {
  commentCommandSchema,
  compareChronologically,
  parsePromptResponse,
  type CommentCommand,
  type CommentCollaboration,
  type CommentPrompt,
  type CommentRecipient,
  type CommentResponse,
  type CommentThread,
} from "@/comments/comment-model";
import type { Database, Json } from "@/lib/supabase/database.types";

type CommentRow = Database["public"]["Tables"]["comments"]["Row"];
type ReplyRow = Database["public"]["Tables"]["comment_replies"]["Row"];
type PromptRow = Database["public"]["Tables"]["comment_prompts"]["Row"];
type ResponseRow = Database["public"]["Tables"]["comment_responses"]["Row"];
type ParticipantRow =
  Database["public"]["Tables"]["comment_thread_participants"]["Row"];
type RecipientRow =
  Database["public"]["Tables"]["comment_message_recipients"]["Row"];

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
    const [
      targetsResult,
      repliesResult,
      promptsResult,
      participantsResult,
      recipientsResult,
      runsResult,
    ] = await Promise.all([
      this.supabase
        .from("comment_targets")
        .select("id,comment_id,target_object_id,target_order,created_at")
        .in("comment_id", commentIds)
        .order("target_order", { ascending: true })
        .order("id", { ascending: true }),
      this.supabase
        .from("comment_replies")
        .select(
          "id,comment_id,author_id,author_kind,author_key,body,created_at,updated_at",
        )
        .in("comment_id", commentIds)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }),
      this.supabase
        .from("comment_prompts")
        .select("id,comment_id,kind,minimum,maximum,created_at")
        .in("comment_id", commentIds),
      this.supabase
        .from("comment_thread_participants")
        .select(
          "id,comment_id,participant_kind,participant_user_id,participant_ai_key,routing_version,created_at,updated_at,changed_by_reply_id",
        )
        .in("comment_id", commentIds)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }),
      this.supabase
        .from("comment_message_recipients")
        .select(
          "id,comment_id,reply_id,recipient_kind,recipient_user_id,recipient_ai_key,routing_version,source,created_at",
        )
        .in("comment_id", commentIds)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }),
      this.supabase
        .from("ai_runs")
        .select(
          "id,invoking_comment_id,invoking_reply_id,output_reply_id,requested_by,status,error_code,projection_metadata,created_at,updated_at",
        )
        .in("invoking_comment_id", commentIds)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }),
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
    const participants = requireData(
      participantsResult.data,
      participantsResult.error,
    ) as ParticipantRow[];
    const recipients = requireData(
      recipientsResult.data,
      recipientsResult.error,
    ) as RecipientRow[];
    const runs = requireData(runsResult.data, runsResult.error);
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
      ...participants.flatMap((participant) =>
        participant.participant_user_id
          ? [participant.participant_user_id]
          : [],
      ),
      ...recipients.flatMap((recipient) =>
        recipient.recipient_user_id ? [recipient.recipient_user_id] : [],
      ),
    ].filter((id, index, values) => values.indexOf(id) === index);
    const profilesResult = await this.supabase
      .from("profiles")
      .select("id,display_name")
      .in("id", profileIds);
    const profiles = requireData(profilesResult.data, profilesResult.error);
    const profileNames = new Map(
      profiles.map((profile) => [profile.id, profile.display_name]),
    );
    const toRecipient = (
      row:
        | Pick<
            RecipientRow,
            "recipient_kind" | "recipient_user_id" | "recipient_ai_key"
          >
        | {
            recipient_kind: ParticipantRow["participant_kind"];
            recipient_user_id: string | null;
            recipient_ai_key: string | null;
          },
    ): CommentRecipient =>
      row.recipient_kind === "ai"
        ? { kind: "ai", key: "primary-ai", name: "Thinking Canvas AI" }
        : {
            kind: "human",
            key: row.recipient_user_id!,
            name: profileNames.get(row.recipient_user_id!) ?? "Participant",
          };

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

    const evidenceByReply = new Map<
      string,
      Array<{ objectId: string; label: string }>
    >();
    for (const run of runs) {
      if (!run.output_reply_id) continue;
      const metadata = run.projection_metadata;
      if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
        continue;
      const evidence = metadata.evidence;
      if (!Array.isArray(evidence)) continue;
      evidenceByReply.set(
        run.output_reply_id,
        evidence.flatMap((item) => {
          if (
            !item ||
            typeof item !== "object" ||
            Array.isArray(item) ||
            typeof item.objectId !== "string" ||
            typeof item.label !== "string"
          ) {
            return [];
          }
          return [{ objectId: item.objectId, label: item.label }];
        }),
      );
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
            authorKind: reply.author_kind,
            authorKey: reply.author_key,
            authorName:
              reply.author_kind === "ai"
                ? "Thinking Canvas AI"
                : (profileNames.get(reply.author_id) ?? "Participant"),
            body: reply.body,
            createdAt: reply.created_at,
            updatedAt: reply.updated_at,
            recipients: recipients
              .filter((recipient) => recipient.reply_id === reply.id)
              .map(toRecipient),
            evidence: evidenceByReply.get(reply.id) ?? [],
          }))
          .sort(compareChronologically),
        recipients: recipients
          .filter(
            (recipient) =>
              recipient.comment_id === comment.id &&
              recipient.reply_id === null,
          )
          .map(toRecipient),
        activeParticipants: participants
          .filter((participant) => participant.comment_id === comment.id)
          .map((participant) =>
            toRecipient({
              recipient_kind: participant.participant_kind,
              recipient_user_id: participant.participant_user_id,
              recipient_ai_key: participant.participant_ai_key,
            }),
          ),
        aiRuns: runs
          .filter((run) => run.invoking_comment_id === comment.id)
          .map((run) => ({
            id: run.id,
            status: run.status,
            requestedBy: run.requested_by,
            invokingReplyId: run.invoking_reply_id,
            outputReplyId: run.output_reply_id,
            errorCode: run.error_code,
            createdAt: run.created_at,
            updatedAt: run.updated_at,
          })),
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
          target_ordered_context_ids: command.orderedContextIds,
          target_author_kind: command.authorKind,
          target_author_key: command.authorKey ?? undefined,
          target_anchor_x: command.canvasAnchor?.x ?? undefined,
          target_anchor_y: command.canvasAnchor?.y ?? undefined,
          target_prompt_kind: command.promptKind ?? undefined,
          target_recipient_user_ids: command.routing?.recipientUserIds,
          target_include_primary_ai:
            command.routing?.includePrimaryAi ?? undefined,
        };
      const result = await this.supabase.rpc("create_comment_thread", args);
      return requireData(result.data, result.error).at(0);
    }
    if (command.type === "comment.reply") {
      const result = await this.supabase.rpc("create_comment_reply", {
        target_comment_id: command.commentId,
        target_client_command_id: command.commandId,
        target_body: command.body,
        target_recipient_user_ids: command.routing?.recipientUserIds,
        target_include_primary_ai:
          command.routing?.includePrimaryAi ?? undefined,
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

  async loadCollaboration(canvasId: string): Promise<CommentCollaboration> {
    const [membersResult, accessResult] = await Promise.all([
      this.supabase
        .from("canvas_members")
        .select("user_id,role")
        .eq("canvas_id", canvasId)
        .order("created_at", { ascending: true }),
      this.supabase.rpc("get_canvas_ai_access", { target_canvas_id: canvasId }),
    ]);
    const members = requireData(membersResult.data, membersResult.error);
    const access = requireData(accessResult.data, accessResult.error).at(0);
    if (!access) throw new Error("AI access could not be loaded.");
    const profileIds = members.map((member) => member.user_id);
    const profilesResult = profileIds.length
      ? await this.supabase
          .from("profiles")
          .select("id,display_name")
          .in("id", profileIds)
      : { data: [], error: null };
    const profiles = requireData(profilesResult.data, profilesResult.error);
    const names = new Map(
      profiles.map((profile) => [profile.id, profile.display_name]),
    );
    return {
      collaborators: [
        ...members.map((member) => ({
          kind: "human" as const,
          key: member.user_id,
          name: names.get(member.user_id) ?? "Participant",
          role: member.role,
        })),
        ...(access.enabled && access.effective_authority
          ? [
              {
                kind: "ai" as const,
                key: "primary-ai",
                name: "Thinking Canvas AI",
                role: "primary_ai" as const,
              },
            ]
          : []),
      ],
      aiAccess: {
        enabled: access.enabled,
        configuredAuthority: access.configured_authority,
        effectiveAuthority: access.effective_authority,
        canManage: access.can_manage,
        version: access.version,
      },
    };
  }

  async setAiSettings(
    canvasId: string,
    enabled: boolean,
    authority: CommentCollaboration["aiAccess"]["configuredAuthority"],
    expectedVersion: number,
  ) {
    const result = await this.supabase.rpc("set_canvas_ai_settings", {
      target_canvas_id: canvasId,
      target_enabled: enabled,
      target_authority: authority,
      target_expected_version: expectedVersion,
    });
    return requireData(result.data, result.error).at(0);
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
