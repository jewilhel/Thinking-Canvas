import { z } from "zod";
import { endVoiceCall } from "@/voice/end-voice-call";
import {
  buildVoiceSession,
  voiceSettingsSchema,
  VOICE_MODEL,
  VOICE_DAILY_CENTS,
} from "@/voice/voice-settings";
import {
  authorizeVoice,
  supervisorSignature,
  voiceEnabled,
  voiceProvider,
  voiceService,
} from "@/voice/voice-server";

type Context = { params: Promise<{ canvasId: string }> };
export async function GET(request: Request, context: Context) {
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
  const sessionId = new URL(request.url).searchParams.get("id");
  if (sessionId) {
    const user = await authorizeVoice(canvasId);
    if (!user || !z.uuid().safeParse(sessionId).success)
      return new Response(null, { status: 403 });
    const { data, error } = await voiceService()
      .from("voice_test_sessions")
      .select("supervisor_ready,ended_at,expires_at,worker_started_at")
      .eq("id", sessionId)
      .eq("canvas_id", canvasId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error || !data) return new Response(null, { status: 404 });
    return Response.json(
      {
        ready: data.supervisor_ready && !data.ended_at,
        ended:
          Boolean(data.ended_at) || Date.parse(data.expires_at) <= Date.now(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
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
  const user = await authorizeVoice(canvasId);
  if (!user)
    return Response.json({ enabled: false, reason: "Voice access changed." });
  const { data: pending } = await voiceService()
    .from("voice_test_sessions")
    .select("id")
    .eq("canvas_id", canvasId)
    .eq("user_id", user.id)
    .is("ended_at", null)
    .lt("heartbeat_at", new Date(Date.now() - 30000).toISOString())
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return Response.json({
    enabled: true,
    pendingSessionId: pending?.id,
    model: VOICE_MODEL,
    spentCents: data?.spent_cents ?? 0,
    reservedCents: data?.reserved_cents ?? 0,
    dailyCents: VOICE_DAILY_CENTS,
    resetTimezone: "America/Los_Angeles",
    build: process.env.VOICE_BUILD_REF ?? "unknown",
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
  // A setup that never published readiness cannot have returned SDP or accepted
  // browser media. Recover only expired, unclaimed setups with a known call ID,
  // and only after OpenAI confirms termination (including an already-gone call).
  const { data: abandoned } = await db
    .from("voice_test_sessions")
    .select("id,call_id")
    .is("ended_at", null)
    .is("heartbeat_at", null)
    .eq("supervisor_ready", false)
    .lt("expires_at", new Date().toISOString())
    .not("call_id", "is", null)
    .limit(10);
  for (const session of abandoned ?? []) {
    if (await endVoiceCall(voiceProvider(), session.call_id))
      await db.rpc("finish_voice_test", {
        target_id: session.id,
        target_cents: 0,
        target_reason: "expired_setup_recovered",
      });
  }
  if (parsed.data.restartOf) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const { data: previous } = await db
        .from("voice_test_sessions")
        .select("ended_at,expires_at")
        .eq("id", parsed.data.restartOf)
        .eq("user_id", user.id)
        .eq("canvas_id", canvasId)
        .maybeSingle();
      if (!previous || Date.parse(previous.expires_at) <= Date.now())
        return Response.json(
          { error: "The previous test cannot be restarted." },
          { status: 409 },
        );
      if (previous.ended_at) break;
      if (attempt === 39)
        return Response.json(
          {
            error:
              "The previous test is still ending. Wait for its reservation to clear before restarting.",
          },
          { status: 409 },
        );
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
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
  let supervisorStatus: number | undefined;
  try {
    const session = buildVoiceSession({
      ...parsed.data.settings,
      automaticResponse: false,
    });
    const form = new FormData();
    form.set("sdp", parsed.data.sdp);
    form.set(
      "session",
      JSON.stringify({
        ...session,
        audio: {
          ...session.audio,
          input: {
            ...session.audio.input,
            noise_reduction: session.audio.input.noise_reduction ?? undefined,
            transcription: session.audio.input.transcription ?? undefined,
          },
        },
      }),
    );
    stage = "provider_handshake";
    providerAttempted = true;
    const response = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: form,
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
        process.env.VOICE_DEPLOY_ORIGIN!,
      ),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-voice-signature": supervisorSignature(id),
          // The configured deploy belongs to this same application. Preserve
          // visitor access credentials for Netlify's protected preview gate.
          Cookie: request.headers.get("cookie") ?? "",
        },
        body: JSON.stringify({ id }),
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      },
    );
    supervisorStatus = supervisor.status;
    if (supervisor.status !== 202) throw new Error("supervisor");
    stage = "supervisor_readiness";
    for (let attempt = 0; attempt < 40; attempt++) {
      const { data } = await db
        .from("voice_test_sessions")
        .select("worker_started_at,ended_at")
        .eq("id", id)
        .single();
      if (data?.ended_at) throw new Error("supervisor-ended");
      if (data?.worker_started_at)
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
    console.error("Supervised voice connection failed.", {
      stage,
      supervisorStatus,
    });
    let terminated = !providerAttempted || rejectedHandshake;
    if (callId) terminated = await endVoiceCall(voiceProvider(), callId);
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
          supervisorStatus === 401 || supervisorStatus === 403
            ? "Preview access blocked the voice supervisor. Refresh the preview and retry."
            : "Voice could not establish a supervised connection. Microphone access will be released. Unconfirmed usage remains reserved.",
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
    .select("call_id,ended_at,supervisor_ready,reserved_cents,heartbeat_at")
    .eq("id", id)
    .eq("canvas_id", canvasId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return new Response(null, { status: 404 });
  if (!data.ended_at && data.call_id) {
    if (!(await endVoiceCall(voiceProvider(), data.call_id)))
      return Response.json(
        { error: "The server is still ending the call." },
        { status: 502 },
      );
  }
  const { data: checkpoint } = await db
    .from("voice_test_sessions")
    .select("end_reason,charged_cents")
    .eq("id", id)
    .maybeSingle();
  if (!data.ended_at && data.call_id && checkpoint?.end_reason)
    await db.rpc("finish_voice_test", {
      target_id: id,
      target_cents: checkpoint.charged_cents,
      target_reason: checkpoint.end_reason,
    });
  else if (
    !data.ended_at &&
    data.call_id &&
    data.heartbeat_at &&
    Date.parse(data.heartbeat_at) < Date.now() - 30000
  )
    await db.rpc("finish_voice_test", {
      target_id: id,
      target_cents: data.reserved_cents,
      target_reason: data.supervisor_ready
        ? "hangup_confirmed_usage_unknown"
        : "bootstrap_hangup_confirmed_usage_unknown",
    });
  return new Response(null, { status: 204 });
}
