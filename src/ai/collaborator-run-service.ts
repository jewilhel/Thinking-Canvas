import "server-only";

import { z } from "zod";

import {
  AI_PROJECTION_MAX_SERIALIZED_BYTES,
  type AiProjectionEnvelope,
  aiProjectionEnvelopeSchema,
} from "@/ai/collaborator-contract";
import { FakePrimaryAiGateway } from "@/ai/fake-collaborator-gateway";
import type { FakeAiScenario } from "@/ai/fake-collaborator-gateway";
import { listCanvasObjectsV2 } from "@/canvas/canvas-document";
import { postgresByteaToBytes } from "@/collaboration/canvas-document";
import { buildCompactedSnapshot } from "@/collaboration/persistence";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const runRequestSchema = z.strictObject({
  runId: z.uuid(),
  canvasId: z.uuid(),
});

function objectSummary(object: ReturnType<typeof listCanvasObjectsV2>[number]) {
  if (object.type === "shape")
    return `${object.shape}: ${object.text}`.slice(0, 10_000);
  if (object.type === "text") return object.text.slice(0, 10_000);
  if (object.type === "table")
    return object.cells.flat().join(" | ").slice(0, 10_000);
  if (object.type === "document") return object.title.slice(0, 10_000);
  if (object.type === "connector") return "Connector";
  return "Annotation";
}

export async function completeDeterministicAiRun(
  input: unknown,
  options: {
    signal?: AbortSignal;
    onStatus?: (status: "projecting" | "thinking") => void;
    scenario?: FakeAiScenario;
  } = {},
) {
  const { runId, canvasId } = runRequestSchema.parse(input);
  const user = await getAuthenticatedUser();
  if (!user) throw new AiRunAccessError("Authentication required.");
  const supabase = await createClient();
  const runResult = await supabase
    .from("ai_runs")
    .select(
      "id,canvas_id,invoking_comment_id,invoking_reply_id,requested_by,idempotency_key,authority_snapshot,ordered_context_ids,status,output_reply_id",
    )
    .eq("id", runId)
    .maybeSingle();
  if (runResult.error || !runResult.data) {
    throw new AiRunAccessError("AI run is not accessible.");
  }
  const run = runResult.data;
  if (run.requested_by !== user.id || run.canvas_id !== canvasId) {
    throw new AiRunAccessError("AI run is not accessible.");
  }
  if (run.status === "completed" && run.output_reply_id) {
    return { runId: run.id, replyId: run.output_reply_id, status: run.status };
  }
  if (
    !(["queued", "projecting", "thinking"] as const).includes(
      run.status as never,
    ) ||
    !run.invoking_comment_id
  ) {
    throw new AiRunConflictError("AI run is not queued.");
  }
  if (run.status === "queued") {
    const started = await supabase.rpc("start_ai_run", {
      target_run_id: run.id,
    });
    if (started.error) throw new AiRunConflictError(started.error.message);
  }
  options.onStatus?.("projecting");

  const [
    commentResult,
    replyResult,
    snapshotResult,
    updatesResult,
    threadsResult,
  ] = await Promise.all([
    supabase
      .from("comments")
      .select("id,body,status")
      .eq("id", run.invoking_comment_id)
      .maybeSingle(),
    run.invoking_reply_id
      ? supabase
          .from("comment_replies")
          .select("id,body")
          .eq("id", run.invoking_reply_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("canvas_snapshots")
      .select("version,last_sequence,state,state_hash")
      .eq("canvas_id", run.canvas_id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("canvas_updates")
      .select("sequence,update_data")
      .eq("canvas_id", run.canvas_id)
      .order("sequence", { ascending: true }),
    supabase
      .from("comments")
      .select(
        "id,body,status,comment_targets(target_object_id),comment_replies(body)",
      )
      .eq("canvas_id", run.canvas_id)
      .in("status", ["open", "resolved"])
      .order("created_at", { ascending: true }),
  ]);
  if (
    commentResult.error ||
    !commentResult.data ||
    commentResult.data.status !== "open" ||
    replyResult.error ||
    snapshotResult.error ||
    updatesResult.error ||
    threadsResult.error
  ) {
    throw new AiRunConflictError("AI context is no longer available.");
  }

  const compacted = await buildCompactedSnapshot(
    snapshotResult.data
      ? {
          version: snapshotResult.data.version,
          lastSequence: snapshotResult.data.last_sequence,
          state: postgresByteaToBytes(snapshotResult.data.state),
          stateHash: snapshotResult.data.state_hash,
        }
      : null,
    (updatesResult.data ?? []).map((row) => ({
      sequence: row.sequence,
      update: postgresByteaToBytes(row.update_data),
    })),
  );
  const objects = listCanvasObjectsV2(compacted.document).map((object) => ({
    id: object.id,
    type: object.type,
    summary: objectSummary(object),
  }));
  const commentThreads = (threadsResult.data ?? []).map((thread) => ({
    id: thread.id,
    status: thread.status as "open" | "resolved",
    targetObjectIds: thread.comment_targets.map(
      (target) => target.target_object_id,
    ),
    summary: [thread.body, ...thread.comment_replies.map((reply) => reply.body)]
      .join("\n")
      .slice(0, 10_000),
  }));
  const projectionBase = {
    version: 1 as const,
    canvasId: run.canvas_id,
    objects,
    commentThreads,
    truncated: false,
  };
  const serializedBytes = new TextEncoder().encode(
    JSON.stringify(projectionBase),
  ).length;
  if (serializedBytes > AI_PROJECTION_MAX_SERIALIZED_BYTES) {
    throw new AiRunConflictError(
      "This canvas is too large for a grounded AI response.",
    );
  }
  const projection: AiProjectionEnvelope = aiProjectionEnvelopeSchema.parse({
    ...projectionBase,
    serializedBytes,
  });
  options.onStatus?.("thinking");
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, 1_200);
    options.signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(new DOMException("The AI run was cancelled.", "AbortError"));
      },
      { once: true },
    );
  });
  if (options.signal?.aborted) {
    throw new DOMException("The AI run was cancelled.", "AbortError");
  }
  const instruction = replyResult.data?.body ?? commentResult.data.body;
  const gatewayResult = await new FakePrimaryAiGateway().request({
    invocation: {
      runId: run.id,
      canvasId: run.canvas_id,
      commentId: run.invoking_comment_id,
      replyId: run.invoking_reply_id,
      requestedBy: run.requested_by,
      idempotencyKey: run.idempotency_key,
      authority: run.authority_snapshot,
      instruction,
      selectedPathIds: run.ordered_context_ids,
    },
    projection,
    scenario: options.scenario,
  });
  if (gatewayResult.status !== "completed") {
    throw new AiRunConflictError("The deterministic AI run did not complete.");
  }
  const objectIds = new Set(projection.objects.map((object) => object.id));
  if (
    gatewayResult.reply.evidence.some(
      (reference) => !objectIds.has(reference.objectId),
    )
  ) {
    throw new AiRunConflictError(
      "The AI response referenced an unavailable object.",
    );
  }
  const completionResult = await supabase.rpc("complete_fake_ai_run", {
    target_run_id: run.id,
    target_body: gatewayResult.reply.body,
    target_provider_request_id: gatewayResult.requestId,
    target_projection_metadata: {
      version: projection.version,
      objectCount: projection.objects.length,
      commentThreadCount: projection.commentThreads.length,
      serializedBytes: projection.serializedBytes,
      lastSequence: compacted.lastSequence,
      evidence: gatewayResult.reply.evidence,
    },
  });
  if (completionResult.error || !completionResult.data?.[0]) {
    throw new AiRunConflictError(
      completionResult.error?.message ?? "AI reply could not be saved.",
    );
  }
  return {
    runId: completionResult.data[0].run_id,
    replyId: completionResult.data[0].reply_id,
    status: completionResult.data[0].status,
  };
}

export async function cancelAiRun(input: unknown) {
  const { runId, canvasId } = runRequestSchema.parse(input);
  const user = await getAuthenticatedUser();
  if (!user) throw new AiRunAccessError("Authentication required.");
  const supabase = await createClient();
  const runResult = await supabase
    .from("ai_runs")
    .select("canvas_id,requested_by")
    .eq("id", runId)
    .maybeSingle();
  if (
    runResult.error ||
    !runResult.data ||
    runResult.data.canvas_id !== canvasId ||
    runResult.data.requested_by !== user.id
  ) {
    throw new AiRunAccessError("AI run is not accessible.");
  }
  const result = await supabase.rpc("cancel_ai_run", {
    target_run_id: runId,
  });
  if (result.error || !result.data?.[0]) {
    throw new AiRunConflictError(
      result.error?.message ?? "AI run could not be cancelled.",
    );
  }
  return result.data[0];
}

export async function retryAiRun(input: unknown) {
  const { runId, canvasId } = runRequestSchema.parse(input);
  const user = await getAuthenticatedUser();
  if (!user) throw new AiRunAccessError("Authentication required.");
  const supabase = await createClient();
  const sourceResult = await supabase
    .from("ai_runs")
    .select("canvas_id,requested_by")
    .eq("id", runId)
    .maybeSingle();
  if (
    sourceResult.error ||
    !sourceResult.data ||
    sourceResult.data.canvas_id !== canvasId ||
    sourceResult.data.requested_by !== user.id
  ) {
    throw new AiRunAccessError("AI run is not accessible.");
  }
  const result = await supabase.rpc("retry_ai_run", {
    target_run_id: runId,
    target_idempotency_key: crypto.randomUUID(),
  });
  if (result.error || !result.data?.[0]) {
    throw new AiRunConflictError(
      result.error?.message ?? "AI run could not be retried.",
    );
  }
  return result.data[0];
}

export async function failAiRun(runId: string, errorCode: string) {
  const supabase = await createClient();
  const result = await supabase.rpc("fail_ai_run", {
    target_run_id: runId,
    target_error_code: errorCode,
  });
  if (result.error) throw new AiRunConflictError(result.error.message);
}

export class AiRunAccessError extends Error {}
export class AiRunConflictError extends Error {}
