import { z } from "zod";
import { LIVE_MODEL } from "@/voice/live-protocol";
import {
  authorizeVoice,
  voiceEnabled,
  voiceProvider,
} from "@/voice/voice-server";

/** Unbilled, authenticated migration check using the deployment's own credential. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ canvasId: string }> },
) {
  const { canvasId } = await context.params;
  if (
    !z.uuid().safeParse(canvasId).success ||
    !(await authorizeVoice(canvasId))
  )
    return new Response(null, { status: 403 });
  if (!voiceEnabled()) return new Response(null, { status: 503 });
  try {
    const model = await voiceProvider().models.retrieve(LIVE_MODEL);
    return Response.json(
      { model: model.id, available: true, sessionOpened: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        model: LIVE_MODEL,
        available: false,
        sessionOpened: false,
        error: "The deployment could not verify GPT-Live model access.",
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
