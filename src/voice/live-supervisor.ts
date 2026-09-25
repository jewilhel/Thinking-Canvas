import type { PreviousConversation } from "./previous-conversation";
import OpenAI from "openai";
import { liveAudioActivity } from "./live-audio-activity";
import { LiveEndingObserver } from "./live-ending-observer";
import { ConversationEnd } from "./conversation-end";
import { scheduleVoiceGoodbye } from "./voice-goodbye";
import { retryVoiceCheck } from "./retry-voice-check";
import { controlRequestIsCurrent } from "./live-delegation-contract";
import { LiveDelegationOwner } from "./live-delegation-owner";
import { liveDelegationSignature } from "./live-delegation-signature";
import type { SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { endVoiceCall } from "./end-voice-call";
import { liveUsageUnits, LIVE_UNITS_PER_CENT } from "./live-protocol";

type Session = {
  id: string;
  call_id: string;
  canvas_id: string;
  expires_at: string;
  wrap_up_at?: string | null;
  reserved_cents: number;
  idle_seconds: number;
  idle_warning_seconds: number;
};
/** One trusted owner; provider audio/transcript payloads never leave volatile memory. */
export async function superviseLiveVoice(
  db: SupabaseClient,
  key: string,
  session: Session,
  app: {
    origin: string;
    cookie: string;
    previousConversation?: PreviousConversation;
  },
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
    greeted = false,
    final = false;
  let units = 0,
    lastActivity = Date.now(),
    lastAudio = 0,
    muted = false,
    checking = false;
  let finish!: () => void;
  const completed = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let drain: ReturnType<typeof setTimeout> | undefined;
  let lastDescription = "",
    lastCancel = "";
  const appendAcks = new Map<
    string,
    { resolve: () => void; reject: () => void }
  >();
  const conversationEnd = new ConversationEnd(() =>
    stop("conversation_finished"),
  );
  const owner = new LiveDelegationOwner({
    endSession: (waitForNewOutput) => {
      console.info("Live ending scheduled", {
        sessionId: session.id,
        waitForNewOutput,
      });
      conversationEnd.request(Date.now(), waitForNewOutput);
    },
    previousConversation: app.previousConversation,
    diagnostic: (stage, delegationId) =>
      console.info("Live handoff stage", {
        sessionId: session.id,
        delegationId,
        stage,
      }),
    quiet: () => !endingObserver?.busy && Date.now() - lastAudio >= 2000,
    append: (type, id, content) => {
      if (stopping || socket.readyState !== WebSocket.OPEN)
        return Promise.reject(new Error("Live connection unavailable"));
      const eventId = crypto.randomUUID();
      return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          appendAcks.get(eventId)?.reject();
          stop("result_delivery_timeout");
        }, 10000);
        const settle = (accepted: boolean) => {
          clearTimeout(timer);
          appendAcks.delete(eventId);
          if (accepted) resolve();
          else reject(new Error("Live result delivery unconfirmed"));
        };
        appendAcks.set(eventId, {
          resolve: () => settle(true),
          reject: () => settle(false),
        });
        socket.send(
          JSON.stringify({
            type,
            delegation_id: id,
            event_id: eventId,
            content,
          }),
        );
      });
    },
    cancel: async () => {
      lastCancel = new Date().toISOString();
      const cancelled = await db
        .from("voice_test_sessions")
        .update({ backend_cancel_at: lastCancel })
        .eq("id", session.id);
      if (cancelled.error) stop("accounting_unavailable");
    },
    run: async (id, signal, canvasRequest) => {
      const response = await fetch(
        `${app.origin}/api/canvases/${session.canvas_id}/voice/delegations`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            cookie: app.cookie,
            "x-live-delegation": liveDelegationSignature(
              key,
              session.id,
              id,
              canvasRequest,
            ),
          },
          body: JSON.stringify({
            sessionId: session.id,
            delegationId: id,
            request: canvasRequest,
          }),
          signal: AbortSignal.any([signal, AbortSignal.timeout(50000)]),
        },
      );
      const result = await response.json();
      if (!response.ok || !result.completed || typeof result.text !== "string")
        throw new Error("Task failed");
      if (
        result.endSession === true &&
        typeof result.clarificationQuestion !== "string"
      )
        return {
          text: result.text,
          endSession: true,
          reportBeforeEnding: result.reportBeforeEnding === true,
        };
      return typeof result.clarificationQuestion === "string"
        ? {
            text: result.text,
            clarificationQuestion: result.clarificationQuestion,
          }
        : result.text;
    },
  });
  const endingObserver = new LiveEndingObserver(
    async (text) => {
      const id = `control:ending-observer:${crypto.randomUUID()}`;
      const request = { kind: "ending_check" as const, text };
      const response = await fetch(
        `${app.origin}/api/canvases/${session.canvas_id}/voice/delegations`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            cookie: app.cookie,
            "x-live-delegation": liveDelegationSignature(
              key,
              session.id,
              id,
              request,
            ),
          },
          body: JSON.stringify({
            sessionId: session.id,
            delegationId: id,
            request,
          }),
          signal: AbortSignal.timeout(50000),
        },
      );
      if (!response.ok) {
        console.warn("Live ending check failed", {
          sessionId: session.id,
          status: response.status,
        });
        return false;
      }
      const result = await response.json();
      return {
        end: result.completed === true && result.endSession === true,
        canvasAction: result.completed === true && result.canvasAction === true,
      };
    },
    () => {
      if (!stopping && !owner.busy) {
        console.info("Live ending observed", { sessionId: session.id });
        conversationEnd.confirmCompletedExchange();
      }
    },
    (decision) =>
      console.info("Live ending decision", {
        sessionId: session.id,
        ...decision,
        canvasBusy: owner.busy,
      }),
    () => {
      owner.requestObservedCanvasWork();
    },
  );
  const taskTimer = setInterval(() => {
    owner.tick();
    endingObserver?.tick(
      owner.busy || (conversationEnd.armed && !conversationEnd.awaitingOutput),
      Date.now() - lastAudio >= 1500,
    );
    conversationEnd.tick(owner.busy, Date.now() - lastAudio >= 2500);
  }, 250);
  const probeId = crypto.randomUUID();
  const stop = (why: string) => {
    if (stopping) return;
    stopping = true;
    endingObserver?.close();
    for (const ack of appendAcks.values()) ack.reject();
    reason = why;
    clearInterval(taskTimer);
    void owner.cancel();
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
          "The application supervisor is connected. Canvas AI is available through client delegation for canvas questions, requested object and document creation and editing, selection, opening and closing documents, comments, and undo. Use the participant’s natural wording.",
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
    if (
      [
        "session.delegation.created",
        "session.instructions.appended",
        "session.commentary.appended",
      ].includes(event.type)
    )
      console.info("Live control event", {
        sessionId: session.id,
        type: event.type,
        clientEventId: event.client_event_id ?? null,
      });
    if (
      event.type.endsWith(".appended") &&
      typeof event.client_event_id === "string"
    )
      appendAcks.get(event.client_event_id)?.resolve();
    if (
      event.type === "session.input_transcript.delta" &&
      typeof event.delta === "string" &&
      event.delta.trim()
    )
      conversationEnd.cancel();
    if (event.type === "session.delegation.created") conversationEnd.pause();
    if (
      event.type === "session.output_transcript.delta" &&
      typeof event.delta === "string" &&
      event.delta.trim().length > 0
    )
      conversationEnd.output();
    if (!stopping) {
      owner.receive(event);
      endingObserver?.receive(event);
    }
    if (event.type === "session.input_audio.muted") muted = true;
    if (event.type === "session.input_audio.unmuted") {
      muted = false;
      lastActivity = Date.now();
      if (
        ready &&
        !stopping &&
        !greeted &&
        typeof event.client_event_id === "string" &&
        event.client_event_id.startsWith("voice-ready-")
      ) {
        greeted = true;
        socket.send(
          JSON.stringify({
            type: "session.commentary.append",
            event_id: crypto.randomUUID(),
            delegation_id: null,
            content:
              "The participant's audio connection is now ready. Never invent their name: use only their confirmed preferred name from session instructions, or greet neutrally. Follow any startup or greeting preferences in their conversation instructions, including preferred wording, tone, or a request for no greeting. Those preferences take precedence over the fallback below. If they did not specify a greeting preference, offer one short, warm, naturally varied greeting and then let them lead; avoid a repetitive generic offer to help. If they are already speaking, let them finish and respond to their request instead of interrupting with a greeting. Do not claim to remember a previous conversation unless that context is actually available. Do not inspect or change the canvas for this greeting.",
          }),
        );
      }
    }
    if (
      event.type === "session.input_audio.append" ||
      event.type === "session.output_audio.delta"
    ) {
      if (stopping || (muted && event.type === "session.input_audio.append"))
        return;
      if (liveAudioActivity(event)) {
        lastActivity = lastAudio = Date.now();
        if (event.type === "session.output_audio.delta")
          conversationEnd.output();
      }
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
    if (event.type === "error") {
      const code = event.error?.code;
      console.warn("Live provider error", {
        sessionId: session.id,
        code: typeof code === "string" ? code.slice(0, 100) : null,
      });
      stop("provider_error");
    }
  });
  socket.on("error", () => stop("supervisor_error"));
  socket.on("close", () => {
    stop("connection_lost");
    finish();
  });
  const clearGoodbye = scheduleVoiceGoodbye({
    expiresAt: Date.parse(session.expires_at),
    wrapUpAt: session.wrap_up_at ? Date.parse(session.wrap_up_at) : undefined,
    say: (content) => {
      if (!stopping && ready && socket.readyState === WebSocket.OPEN)
        socket.send(
          JSON.stringify({
            type: "session.commentary.append",
            event_id: crypto.randomUUID(),
            delegation_id: null,
            content,
          }),
        );
    },
    end: () => stop("session_limit"),
  });
  const readyTimeout = setTimeout(() => {
    if (!ready) stop("supervisor_timeout");
  }, 10000);
  const heartbeat = setInterval(async () => {
    if (checking || stopping) return;
    checking = true;
    try {
      const [access, state] = await retryVoiceCheck(
        () =>
          Promise.all([
            db.rpc("voice_test_has_access", { target_id: session.id }),
            db
              .from("voice_test_sessions")
              .update({
                heartbeat_at: new Date().toISOString(),
              })
              .eq("id", session.id)
              .select(
                "close_requested_at,ended_at,idle_keepalive_at,backend_cancel_at,describe_requested_at,backend_reserved_units",
              )
              .single(),
          ]),
        ([access, state]) => Boolean(access.error || state.error),
      );
      if (stopping) return;
      if (access.error || state.error) {
        console.warn("Live access check failed", {
          sessionId: session.id,
          accessCode: access.error?.code,
          stateCode: state.error?.code,
        });
        stop("authorization_unavailable");
        return;
      } else if (state.data.close_requested_at || state.data.ended_at)
        stop("user_left");
      else if (!access.data) stop("access_changed");
      if (stopping) return;
      if (state.data?.idle_keepalive_at)
        lastActivity = Math.max(
          lastActivity,
          Math.min(Date.now(), Date.parse(state.data.idle_keepalive_at)),
        );
      if (
        state.data?.backend_cancel_at &&
        state.data.backend_cancel_at !== lastCancel
      ) {
        lastCancel = state.data.backend_cancel_at;
        // Ignore the cancellation timestamp written by the owner unless there is pending work.
        if (owner.busy) await owner.cancel(false);
      }
      if (
        state.data?.describe_requested_at &&
        state.data.describe_requested_at !== lastDescription
      ) {
        lastDescription = state.data.describe_requested_at;
        if (
          controlRequestIsCurrent(lastDescription, state.data.backend_cancel_at)
        )
          owner.requestDescription(`control:${lastDescription}`);
        lastActivity = Date.now();
      }
      if (owner.busy || state.data?.backend_reserved_units > 0)
        lastActivity = Date.now();
      const idleDeadline =
        lastActivity +
        (session.idle_seconds + session.idle_warning_seconds) * 1000;
      const windingDown = Boolean(
        session.wrap_up_at && Date.now() >= Date.parse(session.wrap_up_at),
      );
      const warning =
        !windingDown && Date.now() >= lastActivity + session.idle_seconds * 1000
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
        !windingDown &&
        Date.now() - lastActivity >
          (session.idle_seconds + session.idle_warning_seconds) * 1000
      )
        stop("idle_limit");
    } catch (error) {
      console.warn("Live supervisor check threw", {
        sessionId: session.id,
        errorName: error instanceof Error ? error.name : "UnknownError",
        frames:
          error instanceof Error ? error.stack?.split("\n").slice(1, 4) : [],
      });
      stop("supervisor_check_failed");
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
    clearGoodbye();
    clearTimeout(readyTimeout);
    clearTimeout(drain);
    clearInterval(heartbeat);
    clearInterval(taskTimer);
    await owner.close();
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
    if (terminated) {
      await db
        .from("voice_test_sessions")
        .update({
          provider_closed_at: new Date().toISOString(),
          end_reason: final ? reason : `${reason}_usage_unconfirmed`,
        })
        .eq("id", session.id);
      await db.rpc("finish_live_voice_test", {
        target_id: session.id,
        target_reason: final ? reason : `${reason}_usage_unconfirmed`,
      });
    }
  }
}
