import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import {
  conservativeUsageCents,
  voiceBudgetAllowsResponse,
} from "../../src/voice/voice-budget";

declare const Netlify: { env: { get(key: string): string | undefined } };
export default async function handler(request: Request) {
  const env = (key: string) => Netlify.env.get(key);
  const key = env("OPENAI_API_KEY");
  if (!key || request.method !== "POST")
    return new Response(null, { status: 403 });
  const input = await request.json().catch(() => null);
  if (
    !input ||
    typeof input.id !== "string" ||
    !/^[a-f0-9-]{36}$/.test(input.id)
  )
    return new Response(null, { status: 400 });
  const signature = request.headers.get("x-voice-signature") ?? "";
  const expected = createHmac("sha256", key)
    .update(`voice-supervisor:${input.id}`)
    .digest("hex");
  if (
    signature.length !== expected.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  )
    return new Response(null, { status: 403 });
  const db = createClient(
    env("NEXT_PUBLIC_SUPABASE_URL")!,
    env("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  // Atomic claim makes platform retries harmless. A failed worker never releases uncertain funds.
  const { data: session, error } = await db
    .from("voice_test_sessions")
    .update({ heartbeat_at: new Date().toISOString() })
    .eq("id", input.id)
    .is("heartbeat_at", null)
    .is("ended_at", null)
    .select()
    .maybeSingle();
  if (error || !session?.call_id) return;
  const expires = Date.parse(session.expires_at);
  let charged = 50; // Conservative allowance for trailing/unreported input and transcription.
  let unknownUsage = false;
  let readinessPublished = false;
  let inflight = false;
  let reason = "connection_ended";
  let closed = false;
  const seen = new Set<string>();
  const socket = new WebSocket(
    `wss://api.openai.com/v1/realtime?call_id=${encodeURIComponent(session.call_id)}`,
    {
      headers: { Authorization: `Bearer ${key}` },
      handshakeTimeout: 8000,
      maxPayload: 2_000_000,
    },
  );
  let finish!: () => void;
  const completed = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const stop = (why: string) => {
    if (closed) return;
    closed = true;
    reason = why;
    finish();
  };
  const deadline = setTimeout(
    () => stop("session_limit"),
    Math.max(0, expires - Date.now()),
  );
  const readyTimeout = setTimeout(() => stop("supervisor_timeout"), 9000);
  socket.on("error", () => {
    unknownUsage = true;
    stop("supervisor_error");
  });
  socket.on("close", () => stop("connection_ended"));
  socket.on("message", (raw) => {
    // Inspect events only in volatile memory. Never log or store provider payloads.
    let event;
    try {
      event = JSON.parse(raw.toString());
    } catch {
      unknownUsage = true;
      stop("invalid_event");
      return;
    }
    if (event.type === "session.created" || event.type === "session.updated") {
      const s = event.session;
      if (
        !s ||
        s.model !== "gpt-realtime-2.1" ||
        typeof s.max_output_tokens !== "number" ||
        s.max_output_tokens > 4096 ||
        s.truncation?.token_limits?.post_instructions !== 8192 ||
        s.tools?.length ||
        s.tracing ||
        (s.instructions?.length ?? 0) > 4000
      ) {
        unknownUsage = true;
        stop("unsafe_configuration");
        return;
      }
      clearTimeout(readyTimeout);
      readinessPublished = true;
      void db
        .from("voice_test_sessions")
        .update({ supervisor_ready: true })
        .eq("id", input.id)
        .then((result) => {
          if (result.error) stop("accounting_unavailable");
        });
    }
    if (event.type === "response.created") {
      if (
        inflight ||
        typeof event.response?.max_output_tokens !== "number" ||
        event.response.max_output_tokens > 4096 ||
        event.response?.conversation_id === null ||
        !voiceBudgetAllowsResponse(session.reserved_cents, charged)
      ) {
        unknownUsage = true;
        stop("budget_limit");
        return;
      }
      inflight = true;
    }
    if (
      event.type === "response.done" ||
      event.type === "conversation.item.input_audio_transcription.completed"
    ) {
      const usage =
        event.type === "response.done" ? event.response?.usage : event.usage;
      const id = event.response?.id ?? event.item_id;
      if (typeof id !== "string") {
        unknownUsage = true;
        stop("unknown_usage");
        return;
      }
      const eventKey = `${event.type}:${id}`;
      if (seen.has(eventKey)) return;
      seen.add(eventKey);
      const cents = conservativeUsageCents(usage);
      if (cents === null) {
        unknownUsage = true;
        stop("unknown_usage");
        return;
      }
      charged += cents;
      if (event.type === "response.done") inflight = false;
      if (!voiceBudgetAllowsResponse(session.reserved_cents, charged))
        stop("budget_limit");
    }
    if (event.type === "conversation.item.input_audio_transcription.failed") {
      unknownUsage = true;
      stop("transcription_failed");
    }
  });
  let checking = false;
  const heartbeat = setInterval(async () => {
    if (checking || closed) return;
    checking = true;
    try {
      const [access, status] = await Promise.all([
        db.rpc("voice_test_has_access", { target_id: input.id }),
        db
          .from("voice_test_sessions")
          .update({ heartbeat_at: new Date().toISOString() })
          .eq("id", input.id)
          .select("ended_at")
          .single(),
      ]);
      if (access.error || status.error) stop("authorization_unavailable");
      else if (!access.data || status.data?.ended_at) stop("access_changed");
    } catch {
      stop("authorization_unavailable");
    } finally {
      checking = false;
    }
  }, 2000);
  try {
    await completed;
  } finally {
    clearTimeout(deadline);
    clearTimeout(readyTimeout);
    clearInterval(heartbeat);
    // Hangup works for WebRTC as well as SIP. Retry boundedly; retain funds on uncertainty.
    let terminated = false;
    for (let attempt = 0; attempt < 3 && !terminated; attempt++) {
      try {
        const response = await fetch(
          `https://api.openai.com/v1/realtime/calls/${encodeURIComponent(session.call_id)}/hangup`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(5000),
          },
        );
        terminated = response.ok || response.status === 404;
      } catch {
        /* A later bounded attempt may succeed. */
      }
    }
    socket.terminate();
    if (terminated)
      await db.rpc("finish_voice_test", {
        target_id: input.id,
        target_cents: !readinessPublished
          ? 0
          : unknownUsage || inflight
            ? session.reserved_cents
            : Math.min(session.reserved_cents, charged),
        target_reason: reason,
      });
  }
}
