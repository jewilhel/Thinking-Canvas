import { z } from "zod";

import {
  AiRunAccessError,
  AiRunConflictError,
  cancelAiRun,
  completeAiRun,
  failAiRun,
  retryAiRun,
} from "@/ai/collaborator-run-service";
import { resolveDeterministicTestScenario } from "@/ai/fake-scenario";
import { privacySafeAiRunErrorCode } from "@/ai/run-failure";
import { createAiRunDeadlineSignal } from "@/ai/run-deadline";

export const maxDuration = 120;

const bodySchema = z.strictObject({ runId: z.uuid() });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ canvasId: string }> },
) {
  const { canvasId } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(canvasId).success || !parsed.success) {
    return Response.json(
      { error: "A valid AI run is required." },
      { status: 400 },
    );
  }
  const encoder = new TextEncoder();
  const requestedScenario = request.headers.get(
    "x-thinking-canvas-test-scenario",
  );
  const scenario = resolveDeterministicTestScenario({
    nodeEnv: process.env.NODE_ENV,
    requestedScenario,
  });
  const stream = new ReadableStream({
    async start(controller) {
      const deadline = createAiRunDeadlineSignal(request.signal);
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const result = await completeAiRun(
          { ...parsed.data, canvasId },
          {
            signal: deadline.signal,
            scenario,
            onStatus: (status) => send({ status, runId: parsed.data.runId }),
          },
        );
        send(result);
      } catch (error) {
        const errorCode = privacySafeAiRunErrorCode(error);
        console.error("AI collaborator run failed.", {
          errorCode,
          errorName: error instanceof Error ? error.name : "UnknownError",
          ...(process.env.NODE_ENV !== "production" && error instanceof Error
            ? { errorMessage: error.message }
            : {}),
        });
        const failure = await failAiRun(parsed.data.runId, errorCode).catch(
          () => undefined,
        );
        const cancelled = failure?.status === "cancelled";
        send({
          status: cancelled ? "cancelled" : "failed",
          runId: parsed.data.runId,
          error: cancelled
            ? "The AI run was cancelled."
            : errorCode === "provider_timeout"
              ? "The AI took too long to complete this request. Retry or simplify the instruction."
              : "The AI run failed.",
        });
      } finally {
        deadline.dispose();
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "cache-control": "no-store",
      "content-type": "application/x-ndjson; charset=utf-8",
    },
  });
}

async function mutateRun(
  request: Request,
  params: Promise<{ canvasId: string }>,
  mutation: typeof cancelAiRun | typeof retryAiRun,
) {
  const { canvasId } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(canvasId).success || !parsed.success) {
    return Response.json(
      { error: "A valid AI run is required." },
      { status: 400 },
    );
  }
  try {
    return Response.json(await mutation({ ...parsed.data, canvasId }));
  } catch (error) {
    if (error instanceof AiRunAccessError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof AiRunConflictError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    return Response.json(
      { error: "The AI run change failed." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ canvasId: string }> },
) {
  return mutateRun(request, params, cancelAiRun);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ canvasId: string }> },
) {
  return mutateRun(request, params, retryAiRun);
}
