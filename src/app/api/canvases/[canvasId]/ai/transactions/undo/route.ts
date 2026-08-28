import { z } from "zod";

import {
  AiTransactionAccessError,
  AiTransactionConflictError,
  undoAiTransaction,
} from "@/ai/transaction-service";

const bodySchema = z.strictObject({
  changeSetId: z.uuid(),
  idempotencyKey: z.uuid(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ canvasId: string }> },
) {
  const { canvasId } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(canvasId).success || !parsed.success) {
    return Response.json(
      { error: "A valid AI change is required." },
      { status: 400 },
    );
  }
  try {
    return Response.json(await undoAiTransaction(canvasId, parsed.data));
  } catch (error) {
    if (error instanceof AiTransactionAccessError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof AiTransactionConflictError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    return Response.json(
      { error: "The AI change could not be undone." },
      { status: 500 },
    );
  }
}
