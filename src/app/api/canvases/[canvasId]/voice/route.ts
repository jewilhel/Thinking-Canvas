import { z } from "zod";
import {
  buildVoiceSession,
  voiceSettingsSchema,
  VOICE_MODEL,
} from "@/voice/voice-settings";
import {
  authorizeVoice,
  supervisorSignature,
  voiceEnabled,
  voiceProvider,
  voiceService,
} from "@/voice/voice-server";

type Context = { params: Promise<{ canvasId: string }> };
export async function GET(_request: Request, context: Context) {
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
    return Response.json({
      enabled: false,
      reason: "Live testing is not enabled on this deployment.",
    });
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
  }).format(new Date());
  const { data, error } = await voiceService()
    .from("voice_test_days")
    .select("spent_cents,reserved_cents")
    .eq("day", day)
    .maybeSingle();
  if (error)
    return Response.json({
      enabled: false,
      reason: "Voice accounting is unavailable.",
    });
  return Response.json({
    enabled: true,
    model: VOICE_MODEL,
    spentCents: data?.spent_cents ?? 0,
    reservedCents: data?.reserved_cents ?? 0,
    dailyCents: 1000,
    resetTimezone: "America/Los_Angeles",
    build: process.env.COMMIT_REF ?? process.env.DEPLOY_ID ?? "unknown",
  });
}
export async function POST(request: Request, context: Context) {
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
      { error: "Live testing is not enabled on this deployment." },
      { status: 503 },
    );
  const parsed = z
    .strictObject({
      sdp: z.string().min(1).max(100_000),
      restartOf: z.uuid().optional(),
      settings: voiceSettingsSchema,
    })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Invalid voice configuration." },
      { status: 400 },
    );
  const user = await authorizeVoice(canvasId);
  if (!user)
    return Response.json({ error: "Voice access changed." }, { status: 403 });
  const db = voiceService();
  const id = crypto.randomUUID();
  const { data: reserved, error } = await db.rpc("reserve_voice_test", {
    target_id: id,
    target_canvas: canvasId,
    target_user: user.id,
    target_previous: parsed.data.restartOf ?? null,
  });
  if (error || !reserved)
    return Response.json(
      {
        error:
          "The shared voice allowance is reserved by another test or exhausted. Try after that test ends; the allowance resets at midnight Pacific.",
      },
      { status: 409 },
    );
  let callId: string | undefined;
  let providerAttempted = false;
  let rejectedHandshake = false;
  let stage = "configuration";
  try {
    const provider = voiceProvider();
    const secret = await provider.realtime.clientSecrets.create({
      expires_after: { anchor: "created_at", seconds: 60 },
      session: (() => {
        const session = buildVoiceSession(parsed.data.settings);
        return {
          ...session,
          audio: {
            ...session.audio,
            input: {
              ...session.audio.input,
              noise_reduction: session.audio.input.noise_reduction ?? undefined,
              transcription: session.audio.input.transcription ?? undefined,
            },
          },
        };
      })(),
    });
    stage = "provider_handshake";
    providerAttempted = true;
    const response = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret.value}`,
        "Content-Type": "application/sdp",
      },
      body: parsed.data.sdp,
      signal: AbortSignal.timeout(15000),
    });
    rejectedHandshake = !response.ok;
    callId = response.headers.get("location")?.split("/").pop();
    if (!response.ok || !callId || !/^rtc_[a-zA-Z0-9_-]+$/.test(callId))
      throw new Error("handshake");
    const sdp = await response.text();
    const stored = await db
      .from("voice_test_sessions")
      .update({ call_id: callId })
      .eq("id", id);
    if (stored.error) throw new Error("storage");
    stage = "supervisor_start";
    const supervisor = await fetch(
      new URL(
        "/.netlify/functions/voice-supervisor-background",
        process.env.DEPLOY_URL!,
      ),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-voice-signature": supervisorSignature(id),
        },
        body: JSON.stringify({ id }),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (supervisor.status !== 202) throw new Error("supervisor");
    stage = "supervisor_readiness";
    for (let attempt = 0; attempt < 40; attempt++) {
      const { data } = await db
        .from("voice_test_sessions")
        .select("supervisor_ready,ended_at")
        .eq("id", id)
        .single();
      if (data?.ended_at) throw new Error("supervisor-ended");
      if (data?.supervisor_ready)
        return Response.json(
          {
            id,
            sdp,
            expiresAt: reserved.expires_at,
            model: VOICE_MODEL,
            reservedCents: reserved.reserved_cents,
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("supervisor-timeout");
  } catch {
    console.error("Supervised voice connection failed.", { stage });
    let terminated = !providerAttempted || rejectedHandshake;
    if (callId) {
      try {
        await voiceProvider().realtime.calls.hangup(callId);
        terminated = true;
      } catch {
        /* Keep the reservation if termination cannot be confirmed. */
      }
    }
    if (terminated)
      await db.rpc("finish_voice_test", {
        target_id: id,
        // The SDP answer was never returned, so the browser could not send media.
        target_cents: 0,
        target_reason: "connection_failed",
      });
    return Response.json(
      {
        error:
          "Voice could not establish a supervised connection. Microphone access will be released. Unconfirmed usage remains reserved.",
      },
      { status: 502 },
    );
  }
}
export async function DELETE(request: Request, context: Context) {
  const { canvasId } = await context.params;
  // Leaving must remain possible after role or AI enablement changes.
  const { getAuthenticatedUser } = await import("@/lib/auth/session");
  const user = await getAuthenticatedUser();
  const id = new URL(request.url).searchParams.get("id");
  if (!user || !z.uuid().safeParse(id).success)
    return new Response(null, { status: 403 });
  const db = voiceService();
  const { data } = await db
    .from("voice_test_sessions")
    .select("call_id,ended_at")
    .eq("id", id)
    .eq("canvas_id", canvasId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return new Response(null, { status: 404 });
  if (!data.ended_at && data.call_id) {
    try {
      await voiceProvider().realtime.calls.hangup(data.call_id);
    } catch {
      return Response.json(
        { error: "The server is still ending the call." },
        { status: 502 },
      );
    }
  }
  return new Response(null, { status: 204 });
}
