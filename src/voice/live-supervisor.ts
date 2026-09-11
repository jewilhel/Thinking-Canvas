import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { endVoiceCall } from "./end-voice-call";
import { liveUsageUnits, LIVE_UNITS_PER_CENT } from "./live-protocol";

type Session = {
  id: string;
  call_id: string;
  expires_at: string;
  reserved_cents: number;
  idle_seconds: number;
  idle_warning_seconds: number;
};
/** One trusted owner; provider audio/transcript payloads never leave volatile memory. */
export async function superviseLiveVoice(
  db: SupabaseClient,
  key: string,
  session: Session,
) {
  const provider = new OpenAI({ apiKey: key, timeout: 5000, maxRetries: 0 });
  const socket = new WebSocket(
    `wss://api.openai.com/v1/live/sessions/${encodeURIComponent(session.call_id)}/attach`,
    {
      headers: { Authorization: `Bearer ${key}` },
      handshakeTimeout: 8000,
      family: 4,
      maxPayload: 2_000_000,
    },
  );
  let reason = "connection_ended",
    stopping = false,
    providerClosed = false,
    ready = false,
    final = false;
  let units = 0,
    lastActivity = Date.now(),
    muted = false,
    checking = false;
  let finish!: () => void;
  const completed = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let drain: ReturnType<typeof setTimeout> | undefined;
  const probeId = crypto.randomUUID();
  const stop = (why: string) => {
    if (stopping) return;
    stopping = true;
    reason = why;
    // Listener already exists. Keep receiving until the final event or bounded drain.
    if (socket.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify({ type: "session.close" }));
    drain = setTimeout(finish, 8000);
    if (providerClosed) finish();
  };
  socket.on("open", () =>
    socket.send(
      JSON.stringify({
        type: "session.thinking.append",
        event_id: probeId,
        delegation_id: null,
        content:
          "The application supervisor is connected. Canvas tools are not available yet.",
      }),
    ),
  );
  socket.on("message", (raw) => {
    let event;
    try {
      event = JSON.parse(raw.toString());
    } catch {
      stop("invalid_event");
      return;
    }
    if (
      event.type === "session.thinking.appended" &&
      event.client_event_id === probeId &&
      !stopping
    ) {
      ready = true;
      void db
        .from("voice_test_sessions")
        .update({ supervisor_ready: true })
        .eq("id", session.id)
        .then((result) => {
          if (result.error) stop("accounting_unavailable");
        });
    }
    if (event.type === "session.input_audio.muted") muted = true;
    if (event.type === "session.input_audio.unmuted") {
      muted = false;
      lastActivity = Date.now();
    }
    if (
      event.type === "session.input_audio.append" ||
      event.type === "session.output_audio.delta"
    ) {
      if (
        stopping ||
        (muted && event.type === "session.input_audio.append") ||
        typeof event.audio !== "string"
      )
        return;
      // Inspect amplitude only; never retain or log the PCM payload.
      const pcm = Buffer.from(event.audio, "base64");
      let sum = 0;
      for (let i = 0; i + 1 < pcm.length; i += 2) {
        const sample = pcm.readInt16LE(i) / 32768;
        sum += sample * sample;
      }
      if (pcm.length >= 2 && Math.sqrt(sum / Math.floor(pcm.length / 2)) > 0.02)
        lastActivity = Date.now();
      return;
    }
    if (
      event.type === "session.usage.updated" ||
      event.type === "session.closed"
    ) {
      const next = liveUsageUnits(event.usage?.seconds);
      if (next !== null) {
        units = Math.max(units, next);
        if (event.type === "session.closed") final = true;
      } else if (event.type !== "session.closed") stop("unknown_usage");
      if (units + 60_000 >= session.reserved_cents * LIVE_UNITS_PER_CENT)
        stop("budget_limit");
    }
    if (event.type === "session.closed") {
      providerClosed = true;
      stop("provider_closed");
      finish();
    }
    if (event.type === "error") stop("provider_error");
  });
  socket.on("error", () => stop("supervisor_error"));
  socket.on("close", () => {
    stop("connection_lost");
    finish();
  });
  const deadline = setTimeout(
    () => stop("session_limit"),
    Math.max(0, Date.parse(session.expires_at) - Date.now()),
  );
  const readyTimeout = setTimeout(() => {
    if (!ready) stop("supervisor_timeout");
  }, 10000);
  const heartbeat = setInterval(async () => {
    if (checking || stopping) return;
    checking = true;
    try {
      const [access, state] = await Promise.all([
        db.rpc("voice_test_has_access", { target_id: session.id }),
        db
          .from("voice_test_sessions")
          .update({
            heartbeat_at: new Date().toISOString(),
          })
          .eq("id", session.id)
          .select("close_requested_at,ended_at,idle_keepalive_at")
          .single(),
      ]);
      if (access.error || state.error) stop("authorization_unavailable");
      else if (state.data.close_requested_at || state.data.ended_at)
        stop("user_left");
      else if (!access.data) stop("access_changed");
      if (state.data?.idle_keepalive_at)
        lastActivity = Math.max(
          lastActivity,
          Math.min(Date.now(), Date.parse(state.data.idle_keepalive_at)),
        );
      const idleDeadline =
        lastActivity +
        (session.idle_seconds + session.idle_warning_seconds) * 1000;
      const warning =
        Date.now() >= lastActivity + session.idle_seconds * 1000
          ? new Date(idleDeadline).toISOString()
          : null;
      const checkpoint = await db
        .from("voice_test_sessions")
        .update({ idle_warning_at: warning })
        .eq("id", session.id);
      if (checkpoint.error) stop("accounting_unavailable");
      if (units)
        await db.rpc("checkpoint_live_voice_usage", {
          target_id: session.id,
          target_units: units,
        });
      if (
        Date.now() - lastActivity >
        (session.idle_seconds + session.idle_warning_seconds) * 1000
      )
        stop("idle_limit");
    } catch {
      stop("authorization_unavailable");
    } finally {
      checking = false;
    }
  }, 2000);
  try {
    const started = await db
      .from("voice_test_sessions")
      .update({ worker_started_at: new Date().toISOString() })
      .eq("id", session.id);
    if (started.error) stop("accounting_unavailable");
    await completed;
  } finally {
    clearTimeout(deadline);
    clearTimeout(readyTimeout);
    clearTimeout(drain);
    clearInterval(heartbeat);
    if (units)
      await db.rpc("checkpoint_live_voice_usage", {
        target_id: session.id,
        target_units: units,
        target_final: final,
      });
    let terminated = providerClosed;
    for (let attempt = 0; attempt < 3 && !terminated; attempt++)
      terminated = await endVoiceCall(provider, session.call_id, "live");
    socket.terminate();
    if (terminated)
      await db.rpc("finish_live_voice_test", {
        target_id: session.id,
        target_reason: final ? reason : `${reason}_usage_unconfirmed`,
      });
  }
}
