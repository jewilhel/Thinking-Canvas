import { z } from "zod";

import {
  AiRunAccessError,
  AiRunConflictError,
  cancelAiRun,
  completeDeterministicAiRun,
  failAiRun,
  retryAiRun,
} from "@/ai/collaborator-run-service";

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
  const scenario =
    process.env.NODE_ENV !== "production" && requestedScenario === "failed"
      ? "failed"
      : undefined;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const result = await completeDeterministicAiRun(
          { ...parsed.data, canvasId },
          {
            signal: request.signal,
            scenario,
            onStatus: (status) => send({ status, runId: parsed.data.runId }),
          },
        );
        send(result);
      } catch (error) {
        const aborted =
          error instanceof DOMException && error.name === "AbortError";
        if (!aborted) {
          await failAiRun(parsed.data.runId, "deterministic_run_failed").catch(
            () => undefined,
          );
        }
        send({
          status: aborted ? "cancelled" : "failed",
          runId: parsed.data.runId,
          error: aborted
            ? "The AI run was cancelled."
            : error instanceof Error
              ? error.message
              : "The AI run failed.",
        });
      } finally {
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
