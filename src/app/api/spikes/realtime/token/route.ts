import { z } from "zod";

import { OpenAiConfigurationError } from "@/ai/openai-responses-gateway";
import { getCanvasRole } from "@/lib/auth/canvas-access";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { createRealtimeClientSecret } from "@/voice/realtime-token";

const requestSchema = z.strictObject({ canvasId: z.uuid() });

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
      { error: "A valid canvas ID is required." },
      { status: 400 },
    );
  }

  const role = await getCanvasRole(parsed.data.canvasId, user.id);
  if (!role) {
    return Response.json({ error: "Canvas access denied." }, { status: 403 });
  }

  try {
    return Response.json(await createRealtimeClientSecret(user.id));
  } catch (error) {
    if (error instanceof OpenAiConfigurationError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    return Response.json(
      { error: "A Realtime session could not be started." },
      { status: 502 },
    );
  }
}
