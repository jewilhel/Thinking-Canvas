import "server-only";

import { z } from "zod";

import {
  AI_PROJECTION_MAX_SERIALIZED_BYTES,
  type AiProjectionEnvelope,
  aiProjectionEnvelopeSchema,
} from "@/ai/collaborator-contract";
import {
  AI_CANVAS_DESIGN_TOKENS,
  AiVisualQualityError,
  assertNoNewDeterministicVisualDefects,
} from "@/ai/visual-grounding";
import type { FakeAiScenario } from "@/ai/fake-collaborator-gateway";
import { planDeterministicLayout } from "@/ai/deterministic-layout";
import {
  createPrimaryAiGateway,
  parsePrimaryAiProviderEnvironment,
} from "@/ai/primary-ai-gateway-factory";
import {
  AI_PROVIDER_ATTEMPT_LIMIT,
  AiProviderOutputError,
  requestPrimaryAiWithRetry,
} from "@/ai/primary-ai-gateway";
import { estimateAiInputTokens } from "@/ai/run-budgets";
import { AI_RUN_STALE_AFTER_MS, throwIfAiRunAborted } from "@/ai/run-deadline";
import { listCanvasObjectsV2 } from "@/canvas/canvas-document";
import {
  buildCanvasObjectDetails,
  commentThreadDetailSchema,
  inspectCanvasObjects,
  inspectCommentThreads,
  validateConnectedPath,
} from "@/ai/grounding";
import {
  assertReviewChangesWithinScope,
  deriveAiReviewScope,
} from "@/ai/review-scope";
import {
  allowedAiToolNames,
  contextualCommentArgumentsSchema,
  executeArgumentsSchema,
  proposalArgumentsSchema,
  reviewLayoutArgumentsSchema,
  reviewNewConnectorsArgumentsSchema,
  reviewNewShapesArgumentsSchema,
  reviewStageArgumentsSchema,
  validateAiToolRequest,
} from "@/ai/tool-registry";
import { broadcastAiCanvasUpdate } from "@/ai/realtime-broadcast";
import { plainLanguageAiReply } from "@/ai/reply-copy";
import {
  buildTrustedCanvasUpdate,
  stableAiToolCommandId,
} from "@/ai/trusted-execution";
import {
  validateCanvasProposal,
  validateCanvasReviewRefinement,
  validateCanvasReviewStage,
  validateReviewExplanations,
} from "@/ai/proposals";
import {
  coalesceReviewNewShapeToolCalls,
  materializeReviewNewShapes,
} from "@/ai/new-shape-stage";
import { materializeReviewNewConnectors } from "@/ai/new-connector-stage";
import {
  renderTargetedCanvasCapture,
  TARGETED_CAPTURE_RENDERER_VERSION,
} from "@/ai/render-capture";
import {
  bytesToPostgresBytea,
  postgresByteaToBytes,
} from "@/collaboration/canvas-document";
import { buildCompactedSnapshot } from "@/collaboration/persistence";
import { getAuthenticatedUser } from "@/lib/auth/session";
import type { Json } from "@/lib/supabase/database.types";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const runRequestSchema = z.strictObject({
  runId: z.uuid(),
  canvasId: z.uuid(),
});

export async function completeAiRun(
  input: unknown,
  options: {
    signal?: AbortSignal;
    onStatus?: (status: "projecting" | "thinking" | "applying") => void;
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
  const accessResult = await supabase.rpc("get_canvas_ai_access", {
    target_canvas_id: run.canvas_id,
  });
  const currentAuthority = accessResult.data?.[0]?.effective_authority;
  if (accessResult.error || !currentAuthority) {
    throw new AiRunAccessError("The primary AI is no longer available.");
  }
  const allowedToolNames = allowedAiToolNames(currentAuthority);
  if (run.status === "completed" && run.output_reply_id) {
    return { runId: run.id, replyId: run.output_reply_id, status: run.status };
  }
  if (
    !(
      ["queued", "projecting", "thinking", "tool_pending", "applying"] as const
    ).includes(run.status as never) ||
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
      .select(
        "id,body,status,anchor_x,anchor_y,comment_targets(target_object_id,target_order)",
      )
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
        "id,body,status,author_kind,author_key,created_at,updated_at,comment_targets(target_object_id,target_order),comment_thread_participants(participant_kind,participant_user_id,participant_ai_key),comment_replies(id,author_kind,author_key,body,created_at,updated_at),comment_prompts(kind,comment_responses(value))",
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
  const sourceObjects = listCanvasObjectsV2(compacted.document);
  const sourceTargetObjectIds = [...commentResult.data.comment_targets]
    .sort((left, right) => left.target_order - right.target_order)
    .map((target) => target.target_object_id);
  const reviewScope = deriveAiReviewScope({
    targetObjectIds: sourceTargetObjectIds,
    orderedContextIds: run.ordered_context_ids,
    hasCanvasAnchor:
      commentResult.data.anchor_x !== null &&
      commentResult.data.anchor_y !== null,
  });
  if (run.ordered_context_ids.length > 1) {
    validateConnectedPath({
      canvasId: run.canvas_id,
      objects: sourceObjects,
      orderedObjectIds: run.ordered_context_ids,
    });
  }
  const objectDetails = buildCanvasObjectDetails(run.canvas_id, sourceObjects);
  const objects = objectDetails.map((object) => ({
    id: object.id,
    type: object.type,
    summary: object.summary,
    geometry: object.geometry,
    groupId: object.groupId,
    orderIndex: object.orderIndex,
    relationshipIds: object.relationshipIds,
    state: object.state,
    visual: object.visual,
  }));
  const threadDetails = (threadsResult.data ?? []).map((thread) => {
    const prompt = thread.comment_prompts?.[0];
    return commentThreadDetailSchema.parse({
      id: thread.id,
      status: thread.status,
      body: thread.body,
      authorKind: thread.author_kind,
      authorKey: thread.author_key,
      targetObjectIds: [...thread.comment_targets]
        .sort((left, right) => left.target_order - right.target_order)
        .map((target) => target.target_object_id),
      participantKeys: thread.comment_thread_participants
        .map((participant) =>
          participant.participant_kind === "ai"
            ? participant.participant_ai_key
            : participant.participant_user_id,
        )
        .filter((key): key is string => key !== null)
        .sort(),
      createdAt: thread.created_at,
      updatedAt: thread.updated_at,
      replies: thread.comment_replies.map((reply) => ({
        id: reply.id,
        authorKind: reply.author_kind,
        authorKey: reply.author_key,
        body: reply.body,
        createdAt: reply.created_at,
        updatedAt: reply.updated_at,
      })),
      prompt: prompt
        ? {
            kind: prompt.kind,
            responses: prompt.comment_responses.map(
              (response) => response.value,
            ),
          }
        : null,
    });
  });
  const commentThreads = threadDetails.map((thread) => ({
    id: thread.id,
    status: thread.status,
    targetObjectIds: thread.targetObjectIds,
    summary: [thread.body, ...thread.replies.map((reply) => reply.body)]
      .join("\n")
      .slice(0, 10_000),
    participantKeys: thread.participantKeys,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
  }));
  const objectInspection = inspectCanvasObjects(objectDetails, {
    tool: "inspect_canvas_objects",
    cursor: 0,
    limit: 25,
  });
  const threadInspection = inspectCommentThreads(threadDetails, {
    tool: "inspect_comment_threads",
    cursor: 0,
    limit: 25,
  });
  const projectionBase = {
    version: 2 as const,
    canvasId: run.canvas_id,
    objects,
    commentThreads,
    designTokens: AI_CANVAS_DESIGN_TOKENS,
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
  const instruction = replyResult.data?.body ?? commentResult.data.body;
  const projection: AiProjectionEnvelope = aiProjectionEnvelopeSchema.parse({
    ...projectionBase,
    serializedBytes,
  });
  const providerConfig = parsePrimaryAiProviderEnvironment(process.env);
  const estimatedInputTokens = estimateAiInputTokens({
    instruction,
    projectionSerializedBytes: projection.serializedBytes,
  });
  const reservationResult = await createServiceClient().rpc(
    "reserve_ai_run_budget",
    {
      target_run_id: run.id,
      target_requester_id: run.requested_by,
      target_input_tokens: Math.min(
        1_000_000,
        estimatedInputTokens * AI_PROVIDER_ATTEMPT_LIMIT,
      ),
      target_output_tokens: Math.min(
        16_000,
        providerConfig.OPENAI_RESPONSES_MAX_OUTPUT_TOKENS *
          AI_PROVIDER_ATTEMPT_LIMIT,
      ),
    },
  );
  if (reservationResult.error || !reservationResult.data?.[0]) {
    const message =
      reservationResult.error?.message ??
      "The AI request budget is unavailable.";
    if (reservationResult.error?.code === "P0001") {
      throw new AiRunLimitError(message);
    }
    throw new AiRunConflictError(message);
  }
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
  throwIfAiRunAborted(options.signal);
  const gateway = createPrimaryAiGateway();
  const { result: gatewayResult, attemptCount: providerAttemptCount } =
    await requestPrimaryAiWithRetry(gateway, {
      invocation: {
        runId: run.id,
        canvasId: run.canvas_id,
        commentId: run.invoking_comment_id,
        replyId: run.invoking_reply_id,
        requestedBy: run.requested_by,
        idempotencyKey: run.idempotency_key,
        authority: currentAuthority,
        instruction,
        selectedPathIds: run.ordered_context_ids,
        reviewContext: {
          kind: reviewScope.kind,
          objectIds: reviewScope.objectIds,
          canvasAnchor:
            commentResult.data.anchor_x !== null &&
            commentResult.data.anchor_y !== null
              ? {
                  x: commentResult.data.anchor_x,
                  y: commentResult.data.anchor_y,
                }
              : null,
        },
      },
      projection,
      allowedToolNames,
      scenario: options.scenario,
      signal: options.signal,
    });
  if (gatewayResult.status !== "completed") {
    throw new AiRunConflictError("The AI collaborator run did not complete.");
  }
  const objectIds = new Set(projection.objects.map((object) => object.id));
  let toolCalls: typeof gatewayResult.toolCalls;
  try {
    toolCalls = coalesceReviewNewShapeToolCalls(gatewayResult.toolCalls);
  } catch {
    throw new AiProviderOutputError();
  }
  const isNewObjectReview = toolCalls.some(
    (toolCall) =>
      toolCall.toolName === "stage_new_shapes" ||
      toolCall.toolName === "stage_new_connectors",
  );
  const groundedEvidence = gatewayResult.reply.evidence.filter((reference) =>
    objectIds.has(reference.objectId),
  );
  const groundedContextualTargetObjectIds =
    gatewayResult.reply.contextualTargetObjectIds.filter((objectId) =>
      objectIds.has(objectId),
    );
  if (
    !isNewObjectReview &&
    (groundedEvidence.length !== gatewayResult.reply.evidence.length ||
      groundedContextualTargetObjectIds.length !==
        gatewayResult.reply.contextualTargetObjectIds.length)
  ) {
    throw new AiRunConflictError(
      "The AI response referenced an unavailable object.",
    );
  }
  const contextualToolResults: Array<{
    callKey: string;
    commentId: string;
    created: boolean;
    targetObjectIds: string[];
  }> = [];
  const proposalToolResults: Array<{
    callKey: string;
    commandTypes: string[];
    affectedObjectIds: string[];
    created: boolean;
  }> = [];
  const reviewStageToolResults: Array<{
    callKey: string;
    changeSetId: string;
    objectChangeCount: number;
    commandTypes: string[];
    affectedObjectIds: string[];
    activationSequence: number;
    created: boolean;
  }> = [];
  const trustedExecutionResults: Array<{
    callKey: string;
    commandTypes: string[];
    affectedObjectIds: string[];
    commandId: string;
    sequence: number;
    created: boolean;
  }> = [];
  const replySections = [plainLanguageAiReply(gatewayResult.reply.body)];
  for (const toolCall of toolCalls) {
    let validatedTool: ReturnType<typeof validateAiToolRequest>;
    try {
      validatedTool = validateAiToolRequest({
        authority: currentAuthority,
        toolName: toolCall.toolName,
        arguments: toolCall.arguments,
      });
    } catch {
      throw new AiProviderOutputError();
    }
    if (validatedTool.toolName === "execute_canvas_commands") {
      options.onStatus?.("applying");
      const toolArguments = executeArgumentsSchema.parse(
        validatedTool.arguments,
      );
      const service = createServiceClient();
      const commandId = await stableAiToolCommandId({
        runId: run.id,
        callKey: toolCall.callKey,
      });
      const retryResult = await service.rpc("get_ai_canvas_execution_retry", {
        target_run_id: run.id,
        target_requester_id: run.requested_by,
        target_call_key: toolCall.callKey,
        target_command_id: commandId,
      });
      if (retryResult.error) {
        throw new AiRunConflictError(retryResult.error.message);
      }

      let update: Uint8Array;
      let affectedObjectIds: string[];
      let sequence: number;
      let created: boolean;
      if (retryResult.data?.[0]) {
        update = postgresByteaToBytes(retryResult.data[0].update_data);
        affectedObjectIds = retryResult.data[0].affected_object_ids;
        sequence = retryResult.data[0].sequence;
        created = false;
      } else {
        const execution = await buildTrustedCanvasUpdate({
          document: compacted.document,
          canvasId: run.canvas_id,
          actorId: run.requested_by,
          runId: run.id,
          callKey: toolCall.callKey,
          commands: toolArguments.commands,
        });
        const toolResult = await service.rpc("execute_ai_canvas_commands", {
          target_run_id: run.id,
          target_requester_id: run.requested_by,
          target_call_key: toolCall.callKey,
          target_command_id: execution.commandId,
          target_update_data: bytesToPostgresBytea(execution.update),
          target_affected_object_ids: execution.affectedObjectIds,
          target_expected_sequence: compacted.lastSequence,
        });
        if (toolResult.error || !toolResult.data?.[0]) {
          throw new AiRunConflictError(
            toolResult.error?.message ??
              "The trusted canvas changes could not be applied.",
          );
        }
        update = execution.update;
        affectedObjectIds = execution.affectedObjectIds;
        sequence = toolResult.data[0].sequence;
        created = toolResult.data[0].created;
      }

      await broadcastAiCanvasUpdate({
        canvasId: run.canvas_id,
        sequence,
        update,
      });
      trustedExecutionResults.push({
        callKey: toolCall.callKey,
        commandTypes: toolArguments.commands.map((command) => command.type),
        affectedObjectIds,
        commandId,
        sequence,
        created,
      });
      replySections.push(
        "The change is on the canvas. You can undo it if needed.",
      );
      continue;
    }
    if (validatedTool.toolName === "propose_canvas_commands") {
      const toolArguments = proposalArgumentsSchema.parse(
        validatedTool.arguments,
      );
      const proposal = validateCanvasProposal({
        document: compacted.document,
        canvasId: run.canvas_id,
        actorId: run.requested_by,
        commands: toolArguments.commands,
      });
      const toolResult = await createServiceClient().rpc(
        "record_ai_canvas_proposal",
        {
          target_run_id: run.id,
          target_requester_id: run.requested_by,
          target_call_key: toolCall.callKey,
          target_affected_object_ids: proposal.affectedObjectIds,
          target_expected_sequence: compacted.lastSequence,
        },
      );
      if (toolResult.error || !toolResult.data?.[0]) {
        throw new AiRunConflictError(
          toolResult.error?.message ?? "The proposal could not be recorded.",
        );
      }
      proposalToolResults.push({
        callKey: toolCall.callKey,
        commandTypes: proposal.commandTypes,
        affectedObjectIds: proposal.affectedObjectIds,
        created: toolResult.data[0].created,
      });
      replySections.push(
        "The proposal did not change the canvas. Reply if you want me to apply or adjust it.",
      );
      continue;
    }
    if (
      validatedTool.toolName === "stage_canvas_changes" ||
      validatedTool.toolName === "stage_layout_changes" ||
      validatedTool.toolName === "stage_new_shapes" ||
      validatedTool.toolName === "stage_new_connectors"
    ) {
      if (reviewStageToolResults.length > 0) {
        throw new AiRunConflictError(
          "One AI run may create only one reviewable change set.",
        );
      }
      const toolArguments =
        validatedTool.toolName === "stage_canvas_changes"
          ? reviewStageArgumentsSchema.parse(validatedTool.arguments)
          : validatedTool.toolName === "stage_layout_changes"
            ? reviewLayoutArgumentsSchema.parse(validatedTool.arguments)
            : validatedTool.toolName === "stage_new_shapes"
              ? reviewNewShapesArgumentsSchema.parse(validatedTool.arguments)
              : reviewNewConnectorsArgumentsSchema.parse(
                  validatedTool.arguments,
                );
      const newShapeStage =
        "shapes" in toolArguments
          ? await materializeReviewNewShapes({
              arguments: toolArguments,
              runId: run.id,
              callKey: toolCall.callKey,
              canvasId: run.canvas_id,
              actorId: run.requested_by,
            })
          : null;
      const newConnectorStage =
        "connectors" in toolArguments
          ? await materializeReviewNewConnectors({
              arguments: toolArguments,
              sourceObjects,
              runId: run.id,
              callKey: toolCall.callKey,
              canvasId: run.canvas_id,
              actorId: run.requested_by,
            })
          : null;
      const commands =
        "commands" in toolArguments
          ? toolArguments.commands
          : "layout" in toolArguments
            ? planDeterministicLayout({
                objects: sourceObjects,
                request: toolArguments.layout,
              })
            : (newShapeStage?.commands ?? newConnectorStage!.commands);
      let reviewStage = validateCanvasReviewStage({
        document: compacted.document,
        canvasId: run.canvas_id,
        actorId: run.requested_by,
        commands,
      });
      assertReviewChangesWithinScope({
        scope: reviewScope,
        changes: reviewStage.objectChanges,
      });
      const requestedExplanations =
        "shapes" in toolArguments
          ? newShapeStage!.explanations
          : "connectors" in toolArguments
            ? newConnectorStage!.explanations
            : toolArguments.explanations;
      const explanations =
        "layout" in toolArguments
          ? requestedExplanations.filter((explanation) =>
              reviewStage.affectedObjectIds.includes(explanation.objectId),
            )
          : requestedExplanations;
      let explainedChanges = validateReviewExplanations({
        reviewStage,
        explanations,
      });
      assertNoNewDeterministicVisualDefects({
        beforeObjects: sourceObjects,
        afterObjects: reviewStage.visualObjects,
        targetObjectIds: reviewStage.affectedObjectIds,
      });
      const allFocusObjects = [...sourceObjects, ...reviewStage.visualObjects];
      const allObjectIds = [
        ...new Set(allFocusObjects.map((object) => object.id)),
      ];
      let visualFeedbackMetadata: Record<string, string | number> = {
        projectionVersion: projection.version,
        rendererVersion: TARGETED_CAPTURE_RENDERER_VERSION,
        captureCount: 0,
        feedbackPassCount: 0,
        feedbackStatus: "unavailable",
        feedbackIssueCount: 0,
      };
      try {
        const [beforeCapture, afterCapture, beforeOverview, afterOverview] =
          await Promise.all([
            renderTargetedCanvasCapture({
              objects: sourceObjects,
              focusObjects: allFocusObjects,
              targetObjectIds: reviewStage.affectedObjectIds,
              label: "before",
            }),
            renderTargetedCanvasCapture({
              objects: reviewStage.visualObjects,
              focusObjects: allFocusObjects,
              targetObjectIds: reviewStage.affectedObjectIds,
              label: "after",
            }),
            renderTargetedCanvasCapture({
              objects: sourceObjects,
              focusObjects: allFocusObjects,
              targetObjectIds: allObjectIds,
              label: "before",
            }),
            renderTargetedCanvasCapture({
              objects: reviewStage.visualObjects,
              focusObjects: allFocusObjects,
              targetObjectIds: allObjectIds,
              label: "after",
            }),
          ]);
        const visualReview = await gateway.reviewVisualChange?.({
          instruction,
          targetObjectIds: reviewStage.affectedObjectIds,
          beforeImageDataUrl: beforeCapture.dataUrl,
          afterImageDataUrl: afterCapture.dataUrl,
          beforeOverviewImageDataUrl: beforeOverview.dataUrl,
          afterOverviewImageDataUrl: afterOverview.dataUrl,
          proposedCommands: reviewStage.commands,
          proposedObjectStates: reviewStage.objectChanges.map(
            (change) => change.afterState,
          ),
          signal: options.signal,
        });
        if (visualReview?.status === "fail") {
          throw new AiVisualQualityError(
            "The targeted visual quality check found a blocking layout defect.",
          );
        }
        let captureCount = 4;
        let feedbackPassCount = visualReview ? 1 : 0;
        let finalVisualReview = visualReview;
        if (
          visualReview?.status === "refine" &&
          !visualReview.replacementCommands
        ) {
          throw new Error("Visual refinement commands were unavailable.");
        }
        if (
          visualReview?.status === "refine" &&
          visualReview.replacementCommands
        ) {
          const refinedStage = validateCanvasReviewRefinement({
            document: compacted.document,
            canvasId: run.canvas_id,
            actorId: run.requested_by,
            proposedCommands: commands,
            refinementCommands: visualReview.replacementCommands,
          });
          assertReviewChangesWithinScope({
            scope: reviewScope,
            changes: refinedStage.objectChanges,
          });
          const originalIds = [...reviewStage.affectedObjectIds].sort();
          const refinedIds = [...refinedStage.affectedObjectIds].sort();
          if (JSON.stringify(originalIds) !== JSON.stringify(refinedIds)) {
            throw new Error(
              "Visual refinement must preserve the exact affected object set.",
            );
          }
          const refinedExplanations = validateReviewExplanations({
            reviewStage: refinedStage,
            explanations,
          });
          assertNoNewDeterministicVisualDefects({
            beforeObjects: sourceObjects,
            afterObjects: refinedStage.visualObjects,
            targetObjectIds: refinedStage.affectedObjectIds,
          });
          const [refinedAfterCapture, refinedAfterOverview] = await Promise.all(
            [
              renderTargetedCanvasCapture({
                objects: refinedStage.visualObjects,
                focusObjects: [...sourceObjects, ...refinedStage.visualObjects],
                targetObjectIds: refinedStage.affectedObjectIds,
                label: "after",
              }),
              renderTargetedCanvasCapture({
                objects: refinedStage.visualObjects,
                focusObjects: [...sourceObjects, ...refinedStage.visualObjects],
                targetObjectIds: allObjectIds,
                label: "after",
              }),
            ],
          );
          const confirmation = await gateway.reviewVisualChange?.({
            instruction,
            targetObjectIds: refinedStage.affectedObjectIds,
            beforeImageDataUrl: beforeCapture.dataUrl,
            afterImageDataUrl: refinedAfterCapture.dataUrl,
            beforeOverviewImageDataUrl: beforeOverview.dataUrl,
            afterOverviewImageDataUrl: refinedAfterOverview.dataUrl,
            proposedCommands: refinedStage.commands,
            proposedObjectStates: refinedStage.objectChanges.map(
              (change) => change.afterState,
            ),
            signal: options.signal,
          });
          captureCount = 6;
          feedbackPassCount = 2;
          if (!confirmation || confirmation.status !== "pass") {
            throw new AiVisualQualityError(
              "The bounded visual refinement did not resolve the layout defect.",
            );
          }
          reviewStage = refinedStage;
          explainedChanges = refinedExplanations;
          finalVisualReview = confirmation;
        }
        visualFeedbackMetadata = {
          projectionVersion: projection.version,
          rendererVersion: TARGETED_CAPTURE_RENDERER_VERSION,
          captureCount,
          feedbackPassCount,
          feedbackStatus: finalVisualReview?.status ?? "not_available",
          feedbackIssueCount: finalVisualReview?.issueCount ?? 0,
          captureWidth: Math.max(beforeCapture.width, afterCapture.width),
          captureHeight: Math.max(beforeCapture.height, afterCapture.height),
          contextObjectCount: new Set([
            ...beforeCapture.contextObjectIds,
            ...afterCapture.contextObjectIds,
          ]).size,
        };
      } catch (error) {
        if (
          error instanceof AiRunConflictError ||
          error instanceof AiVisualQualityError ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          throw error;
        }
      }
      const toolResult = await createServiceClient().rpc(
        "stage_ai_canvas_changes",
        {
          target_run_id: run.id,
          target_requester_id: run.requested_by,
          target_call_key: toolCall.callKey,
          target_summary: toolArguments.summary,
          target_changes: JSON.parse(
            JSON.stringify(reviewStage.objectChanges),
          ) as Json,
          target_expected_sequence: compacted.lastSequence,
        },
      );
      if (toolResult.error || !toolResult.data?.[0]) {
        throw new AiRunConflictError(
          toolResult.error?.message ??
            "The review-stage changes could not be saved.",
        );
      }
      const finalizationResult = await createServiceClient().rpc(
        "finalize_ai_review_stage",
        {
          target_change_set_id: toolResult.data[0].change_set_id,
          target_requester_id: run.requested_by,
          target_summary: toolArguments.summary,
          target_explanations: JSON.parse(
            JSON.stringify(
              explainedChanges.map(({ objectId, whatChanged, why }) => ({
                objectId,
                whatChanged,
                why,
              })),
            ),
          ) as Json,
          target_scope_kind: reviewScope.kind,
          target_scope_object_ids: reviewScope.objectIds,
          target_visual_feedback_metadata: visualFeedbackMetadata,
        },
      );
      if (finalizationResult.error || !finalizationResult.data?.[0]) {
        throw new AiRunConflictError(
          finalizationResult.error?.message ??
            "The review-stage contract could not be finalized.",
        );
      }
      const activationResult = await createServiceClient().rpc(
        "activate_ai_review_stage",
        {
          target_change_set_id: toolResult.data[0].change_set_id,
          target_requester_id: run.requested_by,
          target_update_data: bytesToPostgresBytea(reviewStage.tentativeUpdate),
          target_expected_sequence: compacted.lastSequence,
        },
      );
      if (activationResult.error || !activationResult.data?.[0]) {
        throw new AiRunConflictError(
          activationResult.error?.message ??
            "The review changes could not be activated tentatively.",
        );
      }
      await broadcastAiCanvasUpdate({
        canvasId: run.canvas_id,
        sequence: activationResult.data[0].sequence,
        update: reviewStage.tentativeUpdate,
      });
      reviewStageToolResults.push({
        callKey: toolCall.callKey,
        changeSetId: toolResult.data[0].change_set_id,
        objectChangeCount: toolResult.data[0].object_change_count,
        commandTypes: reviewStage.commandTypes,
        affectedObjectIds: reviewStage.affectedObjectIds,
        activationSequence: activationResult.data[0].sequence,
        created: toolResult.data[0].created,
      });
      replySections.push(
        "The change is on the canvas. You can undo it or reply with adjustments.",
      );
      continue;
    }
    if (validatedTool.toolName !== "create_contextual_comment") {
      throw new AiRunConflictError(
        "This AI tool is not executable in the current slice.",
      );
    }
    const toolArguments = contextualCommentArgumentsSchema.parse(
      validatedTool.arguments,
    );
    if (toolArguments.targetObjectIds.some((id) => !objectIds.has(id))) {
      throw new AiRunConflictError(
        "The AI contextual comment referenced an unavailable object.",
      );
    }
    const toolResult = await createServiceClient().rpc(
      "execute_ai_contextual_comment",
      {
        target_run_id: run.id,
        target_requester_id: run.requested_by,
        target_call_key: toolCall.callKey,
        target_body: toolArguments.body,
        target_object_ids: toolArguments.targetObjectIds,
        target_expected_sequence: compacted.lastSequence,
      },
    );
    if (toolResult.error || !toolResult.data?.[0]) {
      throw new AiRunConflictError(
        toolResult.error?.message ??
          "The contextual comment could not be saved.",
      );
    }
    contextualToolResults.push({
      callKey: toolCall.callKey,
      commentId: toolResult.data[0].comment_id,
      created: toolResult.data[0].created,
      targetObjectIds: toolArguments.targetObjectIds,
    });
  }
  const completionResult = await supabase.rpc("complete_ai_run", {
    target_run_id: run.id,
    target_body: replySections.join("\n\n"),
    target_provider_request_id: gatewayResult.requestId,
    target_model: gatewayResult.telemetry?.model ?? "deterministic-fake",
    target_input_tokens: gatewayResult.telemetry?.inputTokens ?? 0,
    target_output_tokens: gatewayResult.telemetry?.outputTokens ?? 0,
    target_latency_ms: gatewayResult.telemetry?.latencyMs ?? 0,
    target_projection_metadata: {
      version: projection.version,
      objectCount: projection.objects.length,
      commentThreadCount: projection.commentThreads.length,
      serializedBytes: projection.serializedBytes,
      lastSequence: compacted.lastSequence,
      evidence: groundedEvidence,
      inspectionTools: ["inspect_canvas_objects", "inspect_comment_threads"],
      allowedTools: allowedToolNames,
      providerTelemetry: gatewayResult.telemetry ?? null,
      providerAttemptCount,
      contextualTools: contextualToolResults,
      proposalTools: proposalToolResults,
      reviewStageTools: reviewStageToolResults,
      trustedExecutionTools: trustedExecutionResults,
      objectDetailPageSize: objectInspection.items.length,
      objectDetailNextCursor: objectInspection.nextCursor,
      threadDetailPageSize: threadInspection.items.length,
      threadDetailNextCursor: threadInspection.nextCursor,
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
    changeSetId: reviewStageToolResults.at(-1)?.changeSetId ?? null,
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
    .select("canvas_id,requested_by,status,updated_at")
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
  const active = [
    "queued",
    "projecting",
    "thinking",
    "tool_pending",
    "applying",
  ].includes(sourceResult.data.status);
  if (active) {
    if (
      Date.parse(sourceResult.data.updated_at) >
      Date.now() - AI_RUN_STALE_AFTER_MS
    ) {
      throw new AiRunConflictError("The AI run is still in progress.");
    }
    const expired = await supabase.rpc("fail_ai_run", {
      target_run_id: runId,
      target_error_code: "provider_timeout",
    });
    if (expired.error) {
      throw new AiRunConflictError(expired.error.message);
    }
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
  return result.data?.[0];
}

export class AiRunAccessError extends Error {}
export class AiRunConflictError extends Error {}
export class AiRunLimitError extends AiRunConflictError {}
