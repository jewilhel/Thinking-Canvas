import OpenAI from "openai";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  authorizeVoice,
  voiceProvider,
  voiceService,
} from "@/voice/voice-server";
import { liveDelegationSignature } from "@/voice/live-delegation-signature";
import {
  defaultLiveCanvasRequest,
  liveCanvasRequestSchema,
  voiceBackendUnits,
  VOICE_CONVERSATION_MARKER,
} from "@/voice/live-delegation-contract";
import { createClient } from "@/lib/supabase/server";
import {
  completeAiRun,
  cancelAiRun,
  failAiRun,
} from "@/ai/collaborator-run-service";
import { OpenAiPrimaryAiGateway } from "@/ai/openai-primary-ai-gateway";
import { parsePrimaryAiProviderEnvironment } from "@/ai/primary-ai-gateway-factory";
export const maxDuration = 60;
export async function POST(
  request: Request,
  context: { params: Promise<{ canvasId: string }> },
) {
  const { canvasId } = await context.params;
  const body = z
    .strictObject({
      sessionId: z.uuid(),
      delegationId: z.string().min(1).max(512),
      request: liveCanvasRequestSchema.default(defaultLiveCanvasRequest),
    })
    .safeParse(await request.json().catch(() => null));
  const user = await authorizeVoice(canvasId);
  if (!body.success || !user) return new Response(null, { status: 403 });
  const signature = request.headers.get("x-live-delegation") ?? "";
  const expected = liveDelegationSignature(
    process.env.OPENAI_API_KEY!,
    body.data.sessionId,
    body.data.delegationId,
    body.data.request,
  );
  if (
    !/^[a-f0-9]{64}$/.test(signature) ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  )
    return new Response(null, { status: 403 });
  const db = voiceService();
  const session = await db
    .from("voice_test_sessions")
    .select("id")
    .eq("id", body.data.sessionId)
    .eq("canvas_id", canvasId)
    .eq("user_id", user.id)
    .single();
  if (session.error) return new Response(null, { status: 403 });
  const config = parsePrimaryAiProviderEnvironment(process.env);
  if (config.THINKING_CANVAS_AI_GATEWAY !== "openai")
    return new Response(null, { status: 503 });
  const claim = await db.rpc("reserve_voice_delegation", {
    target_session: body.data.sessionId,
    target_delegation: body.data.delegationId,
  });
  if (claim.error)
    return Response.json(
      { error: "The voice task could not reserve shared allowance." },
      { status: 409 },
    );
  if (!claim.data?.id)
    return Response.json({ duplicate: true }, { status: 202 });
  const taskId: string = claim.data.id;
  const controller = new AbortController();
  const signal = AbortSignal.any([
    request.signal,
    controller.signal,
    AbortSignal.timeout(25000),
  ]);
  let attempted = false,
    units: number | null = 0,
    runId: string | undefined,
    taskStatus = "failed";
  let stage = "authorization";
  const stillAllowed = async () => {
    signal.throwIfAborted();
    const [access, current] = await Promise.all([
      db.rpc("voice_test_has_access", { target_id: body.data.sessionId }),
      db
        .from("voice_test_sessions")
        .select("close_requested_at,provider_closed_at,backend_cancel_at")
        .eq("id", body.data.sessionId)
        .single(),
    ]);
    if (
      access.error ||
      !access.data ||
      current.error ||
      current.data.close_requested_at ||
      current.data.provider_closed_at ||
      (current.data.backend_cancel_at &&
        Date.parse(current.data.backend_cancel_at) >=
          Date.parse(claim.data.created_at))
    ) {
      controller.abort();
      throw new DOMException("Voice task cancelled", "AbortError");
    }
  };
  let checking = false;
  const watchdog = setInterval(async () => {
    if (checking) return;
    checking = true;
    try {
      await stillAllowed();
    } catch {
      controller.abort();
    } finally {
      checking = false;
    }
  }, 750);
  try {
    await stillAllowed();
    const auth = await createClient();
    stage = "create_comment";
    const comment = await auth.rpc("create_comment_thread", {
      target_canvas_id: canvasId,
      target_client_command_id: taskId,
      target_body:
        body.data.request.kind === "conversation"
          ? VOICE_CONVERSATION_MARKER
          : body.data.request.text,
      target_object_ids: [],
      target_anchor_x: 0,
      target_anchor_y: 0,
      target_ordered_context_ids: [],
      target_include_primary_ai: true,
    });
    runId = comment.data?.[0]?.ai_run_id;
    if (comment.error || !runId)
      throw new Error("Task comment could not be created");
    await db
      .from("voice_delegations")
      .update({ ai_run_id: runId, model: config.OPENAI_RESPONSES_MODEL })
      .eq("id", taskId);
    const gateway = new OpenAiPrimaryAiGateway({
      model: config.OPENAI_RESPONSES_MODEL,
      maxOutputTokens: 2048,
      client: {
        async create(input, options) {
          if (
            attempted ||
            new TextEncoder().encode(JSON.stringify(input)).length > 100000 ||
            (input.max_output_tokens ?? Infinity) > 2048
          )
            throw new Error("Voice request exceeds its reserved bound");
          await stillAllowed();
          stage = "provider_request";
          attempted = true;
          units = null;
          const result = await voiceProvider()
            .responses.create(input, options)
            .catch((error) => {
              if (
                error instanceof OpenAI.APIError &&
                [400, 401, 403, 404, 422, 429].includes(error.status ?? 0)
              )
                units = 0;
              throw error;
            });
          if (result.usage) {
            units = voiceBackendUnits(
              config.OPENAI_RESPONSES_MODEL,
              result.usage.input_tokens,
              result.usage.output_tokens,
            );
            await db
              .from("voice_delegations")
              .update({
                input_tokens: result.usage.input_tokens,
                output_tokens: result.usage.output_tokens,
              })
              .eq("id", taskId);
          }
          return result;
        },
        stream() {
          throw new Error("Streaming is outside this bounded voice request");
        },
      },
    });
    stage = "canvas_workflow";
    const completed = await completeAiRun(
      { runId, canvasId },
      {
        signal,
        readOnly: body.data.request.kind === "question",
        voiceTaskId: taskId,
        voiceConversation:
          body.data.request.kind === "conversation"
            ? body.data.request.text
            : undefined,
        gateway,
        beforeComplete: stillAllowed,
      },
    );
    await stillAllowed();
    const reply = await auth
      .from("comment_replies")
      .select("body")
      .eq("id", completed.replyId)
      .single();
    if (reply.error) throw new Error("Verified reply unavailable");
    taskStatus = "completed";
    return Response.json(
      { completed: true, text: reply.data.body, taskId },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.warn("Voice delegation ended without a result", {
      taskId,
      stage,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    taskStatus = signal.aborted ? "cancelled" : "failed";
    if (runId) {
      if (signal.aborted)
        await cancelAiRun({ canvasId, runId }).catch(() => undefined);
      else
        await failAiRun(runId, "voice_request_failed").catch(() => undefined);
    }
    return Response.json(
      { error: "The canvas request did not complete.", taskId },
      { status: 502 },
    );
  } finally {
    clearInterval(watchdog);
    await db.rpc("finish_voice_delegation", {
      target_id: taskId,
      target_status: taskStatus,
      target_units: units,
    });
  }
}
