import "server-only";

import { z } from "zod";

import { broadcastAiCanvasUpdate } from "@/ai/realtime-broadcast";
import { buildDiscardReviewUpdate } from "@/ai/review-state";
import {
  postgresByteaToBytes,
  bytesToPostgresBytea,
} from "@/collaboration/canvas-document";
import { buildCompactedSnapshot } from "@/collaboration/persistence";
import { getAuthenticatedUser } from "@/lib/auth/session";
import type { Json } from "@/lib/supabase/database.types";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const decisionSchema = z.strictObject({
  objectChangeId: z.uuid(),
  decision: z.enum(["keep", "discard", "revise"]),
  note: z.string().trim().max(10_000).nullable().default(null),
  idempotencyKey: z.uuid(),
});

export class AiReviewAccessError extends Error {}
export class AiReviewConflictError extends Error {}

export async function listAiReviews(canvasId: string) {
  const user = await getAuthenticatedUser();
  if (!user) throw new AiReviewAccessError("Authentication required.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_change_sets")
    .select(
      "id,status,source_comment_id,scope_kind,scope_object_ids,summary,activation_sequence,activated_at,completed_at,created_at,ai_object_changes(id,object_id,affected_fields,what_changed,why,review_status,conflict_metadata,result_sequence,review_decisions(id,reviewer_id,decision,note,child_run_id,created_at)),stories(id,title,story_scenes(id,position,target,camera,narration,object_change_id))",
    )
    .eq("canvas_id", canvasId)
    .not("finalization_fingerprint", "is", null)
    .order("created_at", { ascending: false });
  if (error) throw new AiReviewAccessError(error.message);
  return {
    reviews: (data ?? []).map((review) => {
      const positions = new Map(
        (review.stories[0]?.story_scenes ?? []).map((scene) => [
          scene.object_change_id,
          scene.position,
        ]),
      );
      return {
        ...review,
        ai_object_changes: [...review.ai_object_changes].sort(
          (left, right) =>
            (positions.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
            (positions.get(right.id) ?? Number.MAX_SAFE_INTEGER),
        ),
      };
    }),
    currentUserId: user.id,
  };
}

async function loadCurrentCanvas(canvasId: string) {
  const supabase = await createClient();
  const [snapshot, updates] = await Promise.all([
    supabase
      .from("canvas_snapshots")
      .select("version,last_sequence,state,state_hash")
      .eq("canvas_id", canvasId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("canvas_updates")
      .select("sequence,update_data")
      .eq("canvas_id", canvasId)
      .order("sequence", { ascending: true }),
  ]);
  if (snapshot.error || updates.error) {
    throw new AiReviewConflictError("The current canvas could not be loaded.");
  }
  return buildCompactedSnapshot(
    snapshot.data
      ? {
          version: snapshot.data.version,
          lastSequence: snapshot.data.last_sequence,
          state: postgresByteaToBytes(snapshot.data.state),
          stateHash: snapshot.data.state_hash,
        }
      : null,
    (updates.data ?? []).map((row) => ({
      sequence: row.sequence,
      update: postgresByteaToBytes(row.update_data),
    })),
  );
}

export async function decideAiReviewObject(canvasId: string, input: unknown) {
  const parsed = decisionSchema.parse(input);
  const user = await getAuthenticatedUser();
  if (!user) throw new AiReviewAccessError("Authentication required.");
  const supabase = await createClient();
  const { data: objectChange, error } = await supabase
    .from("ai_object_changes")
    .select(
      "id,object_id,before_state,after_state,ai_change_sets!inner(id,canvas_id,source_comment_id)",
    )
    .eq("id", parsed.objectChangeId)
    .eq("ai_change_sets.canvas_id", canvasId)
    .maybeSingle();
  if (error || !objectChange) {
    throw new AiReviewAccessError("Review object is not accessible.");
  }

  let update: Uint8Array | null = null;
  let conflicts: string[] = [];
  let expectedSequence: number | null = null;
  if (parsed.decision !== "keep") {
    const current = await loadCurrentCanvas(canvasId);
    const result = buildDiscardReviewUpdate({
      document: current.document,
      objectChangeId: objectChange.id,
      objectId: objectChange.object_id,
      beforeState: objectChange.before_state,
      afterState: objectChange.after_state,
    });
    update = result.update.length > 2 ? result.update : null;
    conflicts = result.conflicts;
    expectedSequence = current.lastSequence;
  }

  const service = createServiceClient();
  const decisionResult = await service.rpc("decide_ai_review_object", {
    target_object_change_id: parsed.objectChangeId,
    target_reviewer_id: user.id,
    target_decision: parsed.decision,
    target_note: parsed.note ?? "",
    target_idempotency_key: parsed.idempotencyKey,
    target_update_data: bytesToPostgresBytea(update ?? new Uint8Array()),
    target_expected_sequence: expectedSequence ?? -1,
    target_conflicts: conflicts as Json,
  });
  const decision = decisionResult.data?.[0];
  if (decisionResult.error || !decision) {
    const message = decisionResult.error?.message ?? "Review decision failed.";
    if (
      decisionResult.error?.code === "40001" ||
      decisionResult.error?.code === "23505"
    ) {
      throw new AiReviewConflictError(message);
    }
    throw new AiReviewAccessError(message);
  }
  if (update && decision.created) {
    await broadcastAiCanvasUpdate({
      canvasId,
      sequence: decision.result_sequence,
      update,
    });
  }

  let childRunId: string | null = null;
  if (parsed.decision === "revise") {
    const relatedChangeSet = objectChange.ai_change_sets as unknown;
    const thread = (
      Array.isArray(relatedChangeSet) ? relatedChangeSet[0] : relatedChangeSet
    ) as { source_comment_id: string | null } | undefined;
    if (!thread?.source_comment_id || !parsed.note) {
      throw new AiReviewConflictError(
        "Revision context is no longer available.",
      );
    }
    const reply = await supabase.rpc("create_comment_reply", {
      target_comment_id: thread.source_comment_id,
      target_client_command_id: parsed.idempotencyKey,
      target_body: parsed.note,
      target_include_primary_ai: true,
      target_recipient_user_ids: [],
    });
    childRunId = reply.data?.[0]?.ai_run_id ?? null;
    if (reply.error || !childRunId) {
      throw new AiReviewConflictError(
        reply.error?.message ?? "The revision run could not be queued.",
      );
    }
    const link = await service.rpc("link_ai_review_revision", {
      target_decision_id: decision.decision_id,
      target_reviewer_id: user.id,
      target_child_run_id: childRunId,
    });
    if (link.error) throw new AiReviewConflictError(link.error.message);
  }

  return { ...decision, conflicts, childRunId };
}
