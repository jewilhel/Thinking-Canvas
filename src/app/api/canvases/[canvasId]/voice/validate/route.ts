import OpenAI from "openai";
import { z } from "zod";
import {
  authorizeVoice,
  voiceEnabled,
  voiceProvider,
} from "@/voice/voice-server";
import {
  buildVoiceSession,
  effectiveVoiceSettings,
  voiceSettingsSchema,
} from "@/voice/voice-settings";
/** Validate settings with the deployed provider credential, without opening a media call. */
export async function POST(
  request: Request,
  context: { params: Promise<{ canvasId: string }> },
) {
  const { canvasId } = await context.params;
  if (
    !z.uuid().safeParse(canvasId).success ||
    !(await authorizeVoice(canvasId))
  )
    return Response.json(
      { error: "Voice requires canvas AI access." },
      { status: 403 },
    );
  if (!voiceEnabled())
    return Response.json(
      { error: "Live testing is not enabled here." },
      { status: 503 },
    );
  const parsed = voiceSettingsSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return Response.json(
      { error: "Invalid voice configuration." },
      { status: 400 },
    );
  try {
    const session = buildVoiceSession(parsed.data);
    const credential = await voiceProvider().realtime.clientSecrets.create({
      expires_after: { anchor: "created_at", seconds: 60 },
      session: {
        ...session,
        audio: {
          ...session.audio,
          input: {
            ...session.audio.input,
            noise_reduction: session.audio.input.noise_reduction ?? undefined,
            transcription: session.audio.input.transcription ?? undefined,
          },
        },
      },
    });
    // The short-lived credential is discarded. Never return it or create a call.
    return Response.json(
      { accepted: true, settings: effectiveVoiceSettings(credential.session) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const code =
      error instanceof OpenAI.APIError &&
      typeof error.code === "string" &&
      /^[a-zA-Z0-9_.-]{1,100}$/.test(error.code)
        ? error.code
        : "provider_configuration_failed";
    return Response.json(
      { error: `OpenAI rejected this configuration (${code}).`, code },
      { status: 502 },
    );
  }
}
