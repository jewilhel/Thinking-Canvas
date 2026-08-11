import { z } from "zod";

import { AiToolValidationError, runAiCommandSpike } from "@/ai/command-spike";
import {
  OpenAiConfigurationError,
  OpenAiResponsesGateway,
} from "@/ai/openai-responses-gateway";
import { ProjectionLimitError } from "@/ai/projection";
import { canvasObjectSchema } from "@/domain/canvas-object";
import { CommandPermissionError } from "@/domain/command";
import { getCanvasRole } from "@/lib/auth/canvas-access";
import { getAuthenticatedUser } from "@/lib/auth/session";

const requestSchema = z.strictObject({
  canvasId: z.uuid(),
  instruction: z.string(),
  objects: z.array(canvasObjectSchema),
});

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return Response.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid AI command request." },
      { status: 400 },
    );
  }

  const role = await getCanvasRole(parsed.data.canvasId, user.id);
  if (!role) {
    return Response.json({ error: "Canvas access denied." }, { status: 403 });
  }

  try {
    const result = await runAiCommandSpike(
      { ...parsed.data, actorId: user.id, role },
      new OpenAiResponsesGateway(),
    );
    return Response.json(result);
  } catch (error) {
    if (error instanceof ProjectionLimitError) {
      return Response.json({ error: error.message }, { status: 413 });
    }
    if (error instanceof CommandPermissionError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof OpenAiConfigurationError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof AiToolValidationError || error instanceof z.ZodError) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    return Response.json({ error: "The AI request failed." }, { status: 502 });
  }
}
