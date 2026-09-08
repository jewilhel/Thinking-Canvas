import { z } from "zod";

import { OpenAiConfigurationError } from "@/ai/openai-responses-gateway";
import { getCanvasRole } from "@/lib/auth/canvas-access";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { createStoryNarrationClientSecret } from "@/voice/realtime-token";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ canvasId: string }> },
) {
  const { canvasId } = await params;
  const user = await getAuthenticatedUser();
  if (!user) {
    return Response.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  if (!z.uuid().safeParse(canvasId).success) {
    return Response.json(
      { error: "A valid canvas is required." },
      { status: 400 },
    );
  }
  if (!(await getCanvasRole(canvasId, user.id))) {
    return Response.json({ error: "Canvas access denied." }, { status: 403 });
  }
  try {
    return Response.json(await createStoryNarrationClientSecret(user.id));
  } catch (error) {
    if (error instanceof OpenAiConfigurationError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    console.error("Story narration session creation failed.", {
      name: error instanceof Error ? error.name : undefined,
      message: error instanceof Error ? error.message.slice(0, 500) : undefined,
    });
    return Response.json(
      { error: "Narration audio could not be started." },
      { status: 502 },
    );
  }
}
