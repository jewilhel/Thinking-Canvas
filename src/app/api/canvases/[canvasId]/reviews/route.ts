import { z } from "zod";

import {
  AiReviewAccessError,
  AiReviewConflictError,
  decideAiReviewObject,
  listAiReviews,
} from "@/ai/review-service";

function errorResponse(error: unknown) {
  if (error instanceof AiReviewAccessError) {
    return Response.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof AiReviewConflictError) {
    return Response.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof z.ZodError) {
    return Response.json(
      { error: "Review input is invalid." },
      { status: 400 },
    );
  }
  return Response.json(
    { error: "The AI review request failed." },
    { status: 500 },
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ canvasId: string }> },
) {
  const { canvasId } = await params;
  if (!z.uuid().safeParse(canvasId).success) {
    return Response.json(
      { error: "A valid canvas is required." },
      { status: 400 },
    );
  }
  try {
    return Response.json(await listAiReviews(canvasId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ canvasId: string }> },
) {
  const { canvasId } = await params;
  if (!z.uuid().safeParse(canvasId).success) {
    return Response.json(
      { error: "A valid canvas is required." },
      { status: 400 },
    );
  }
  try {
    return Response.json(
      await decideAiReviewObject(
        canvasId,
        await request.json().catch(() => null),
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
