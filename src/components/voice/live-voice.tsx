"use client";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { VoiceControlButton } from "./voice-control-button";
import { Button } from "@/components/ui/button";
import { WorkspacePanel } from "@/components/canvas/workspace-panel";
import { VoiceSettingsPanel } from "./voice-settings-panel";
import {
  buildVoiceSession,
  DEFAULT_VOICE_SETTINGS,
  effectiveVoiceSettings,
  voiceSettingsSchema,
  VOICE_MODEL,
  type VoiceSettings,
} from "@/voice/voice-settings";
import {
  appendVoiceEvent,
  parseVoicePresets,
  readVoiceRecords,
  serializeVoicePresets,
  voiceStorageKeys,
  writeVoiceRecords,
  type VoicePreset,
  type VoiceSettingsEvent,
  type VoiceTestRecord,
} from "@/voice/voice-test-record";
import {
  connectSupervisedVoice,
  type SupervisedVoice,
} from "@/voice/supervised-webrtc";

import {
  availableTranscriptText,
  emptyTranscript,
  markTranscriptGap,
  rememberTranscriptTurn,
  transcriptCoverage,
  type ConversationTranscript,
} from "@/voice/conversation-transcript";

type Props = {
  canvasId: string;
  userId: string;
  controlTarget: HTMLElement | null;
  canSaveTranscript: boolean;
  onSaveTranscript: (text: string) => void;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}
export function LiveVoice({
  canvasId,
  userId,
  controlTarget,
  canSaveTranscript,
  onSaveTranscript,
}: Props) {
  const keys = voiceStorageKeys(userId, canvasId);
  const [draft, setDraft] = useState<VoiceSettings>({
    ...DEFAULT_VOICE_SETTINGS,
  });
  const [effective, setEffective] = useState<Record<string, unknown> | null>(
    null,
  );
  const [panel, setPanel] = useState(false);
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState("Ended");
  const [muted, setMuted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState("");
  const [remaining, setRemaining] = useState(600);
  const [transcript, setTranscript] =
    useState<ConversationTranscript>(emptyTranscript);
  const captions = transcript.turns.filter((turn) => turn.text);
  const coverageWarnings = transcriptCoverage(transcript);
  const [showCaptions, setShowCaptions] = useState(false);
  const [savePreview, setSavePreview] = useState<{
    text: string;
    gaps: string[];
  } | null>(null);
  const [savedTranscript, setSavedTranscript] = useState("");
  const [saveError, setSaveError] = useState("");
  const [presets, setPresets] = useState<VoicePreset[]>(() => {
    try {
      return parseVoicePresets(localStorage.getItem(keys.presets) ?? "[]");
    } catch {
      return [];
    }
  });
  const [records, setRecords] = useState<VoiceTestRecord[]>(() => {
    try {
      return readVoiceRecords(localStorage, keys.records);
    } catch {
      return [];
    }
  });
  const recordsRef = useRef(records);
  const validationRequest = useRef(0);
  const [invoker, setInvoker] = useState<HTMLButtonElement | null>(null);
  const connection = useRef<SupervisedVoice | null>(null);
  const abort = useRef<AbortController | null>(null);
  const recordId = useRef<string | null>(null);
  const pendingUpdate = useRef<{
    id: string;
    settings: VoiceSettings;
    sent: boolean;
  } | null>(null);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const responding = useRef(false);
  const playing = useRef(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasSpoken = useRef(false);
  const currentVoice = useRef(draft.voice);
  const [restartRequired, setRestartRequired] = useState(false);
  const [availability, setAvailability] = useState<{
    enabled: boolean;
    refreshRequired?: boolean;
    pendingSessionId?: string;
    reason?: string;
    spentCents?: number;
    reservedCents?: number;
    build?: string;
  }>({ enabled: false, reason: "Checking live availability…" });
  const connecting = ["Connecting", "Waiting for microphone"].includes(status);
  const connected = status !== "Ended" && !connecting;
  const persist = (next: VoiceTestRecord[]) => {
    recordsRef.current = next;
    setRecords(next);
    try {
      writeVoiceRecords(localStorage, keys.records, next);
    } catch {
      setError(
        "This browser could not save the test record. Export it before leaving this canvas.",
      );
    }
  };
  const log = (event: Omit<VoiceSettingsEvent, "at">) => {
    try {
      persist(
        recordsRef.current.map((record) =>
          record.id === recordId.current
            ? appendVoiceEvent(record, {
                at: new Date().toISOString(),
                ...event,
              })
            : record,
        ),
      );
    } catch {
      setError(
        "The settings record is full. End this test before changing more settings.",
      );
    }
  };
  const finish = () => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    if (restartTimer.current) clearTimeout(restartTimer.current);
    if (updateTimeout.current) clearTimeout(updateTimeout.current);
    pendingUpdate.current = null;
    setPending(false);
    abort.current?.abort();
    abort.current = null;
    connection.current?.close();
    connection.current = null;
    responding.current = false;
    playing.current = false;
    setStatus("Ended");
    setMuted(false);
    persist(
      recordsRef.current.map((record) =>
        record.id === recordId.current && !record.endedAt
          ? { ...record, endedAt: new Date().toISOString() }
          : record,
      ),
    );
    recordId.current = null;
  };
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });
  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      void fetch(`/api/canvases/${canvasId}/voice`, {
        signal: AbortSignal.timeout(10000),
      })
        .then(async (response) => {
          if (
            response.status === 401 &&
            !response.headers.get("content-type")?.includes("application/json")
          ) {
            if (!cancelled)
              setAvailability({
                enabled: false,
                refreshRequired: true,
                reason:
                  "Preview sign-in expired. Refresh the preview to reconnect.",
              });
            return;
          }
          const body = await response.json();
          if (!cancelled)
            setAvailability(
              response.ok
                ? body
                : {
                    enabled: false,
                    reason: body.error ?? "Voice access is unavailable.",
                  },
            );
        })
        .catch(() => {
          if (!cancelled)
            setAvailability({
              enabled: false,
              reason: "Voice availability could not be checked.",
            });
        });
    refresh();
    const timer = setInterval(refresh, 15000);
    const resume = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", resume);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", resume);
      finishRef.current();
    };
  }, [canvasId]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!connection.current) return;
      const seconds = Math.max(
        0,
        Math.ceil(
          (Date.parse(connection.current.expiresAt) - Date.now()) / 1000,
        ),
      );
      setRemaining(seconds);
      if (!seconds) {
        setError(
          "The 10-minute test limit was reached. Start a new session explicitly when ready.",
        );
        finishRef.current();
      }
    }, 1000);
    const leave = () => finishRef.current();
    window.addEventListener("pagehide", leave);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", leave);
    };
  }, []);
  const sendPending = () => {
    const update = pendingUpdate.current;
    if (
      !update ||
      update.sent ||
      !connection.current ||
      responding.current ||
      playing.current
    )
      return;
    update.sent = true;
    const session = buildVoiceSession(update.settings);
    connection.current.send({
      type: "session.update",
      event_id: update.id,
      session: { ...session, model: undefined },
    });
    updateTimeout.current = setTimeout(() => {
      if (pendingUpdate.current?.id !== update.id) return;
      log({
        status: "rejected",
        requestId: update.id,
        errorCode: "acknowledgment_timeout",
      });
      setError(
        "OpenAI did not confirm the update. End and restart before further tuning.",
      );
      finishRef.current();
    }, 15000);
  };
  const receive = (raw: unknown) => {
    const event = object(raw);
    if (event.type === "session.created" || event.type === "session.updated") {
      const accepted = effectiveVoiceSettings(event.session);
      if (!Object.keys(accepted).length) {
        log({ status: "rejected", errorCode: "unrecognized_session_settings" });
        setError(
          "The API settings could not be read. The last confirmed settings are retained; this update is not verified.",
        );
        return;
      }
      setEffective(accepted);
      if (
        connection.current &&
        object(object(accepted.audio).input).transcription === null
      )
        setTranscript((previous) =>
          markTranscriptGap(
            previous,
            "Input transcription was disabled for part of the conversation.",
          ),
        );
      if (event.type === "session.updated" && pendingUpdate.current?.sent) {
        const update = pendingUpdate.current;
        currentVoice.current = update.settings.voice;
        log({ status: "accepted", requestId: update.id, effective: accepted });
        if (updateTimeout.current) clearTimeout(updateTimeout.current);
        pendingUpdate.current = null;
        setPending(false);
        setRestartRequired(false);
      } else log({ status: "accepted", effective: accepted });
    }
    if (event.type === "response.created") {
      responding.current = true;
      setStatus("Thinking");
    }
    if (event.type === "output_audio_buffer.started") {
      playing.current = true;
      hasSpoken.current = true;
      setStatus("Speaking");
    }
    if (
      event.type === "output_audio_buffer.stopped" ||
      event.type === "output_audio_buffer.cleared"
    ) {
      playing.current = false;
      setStatus(responding.current ? "Thinking" : "Listening");
      sendPending();
    }
    if (event.type === "input_audio_buffer.speech_started") {
      setStatus("Listening");
      if (typeof event.item_id === "string")
        setTranscript((previous) =>
          rememberTranscriptTurn(previous, {
            id: event.item_id as string,
            speaker: "You",
          }),
        );
    }
    if (event.type === "response.output_item.added") {
      const item = object(event.item);
      if (item.role === "assistant" && typeof item.id === "string")
        setTranscript((previous) =>
          rememberTranscriptTurn(previous, {
            id: item.id as string,
            speaker: "AI",
          }),
        );
    }
    if (event.type === "conversation.item.input_audio_transcription.failed")
      setTranscript((previous) =>
        markTranscriptGap(previous, "Some speech could not be transcribed."),
      );
    if (event.type === "output_audio_buffer.cleared")
      setTranscript((previous) => {
        const latest = previous.turns.findLast((turn) => turn.speaker === "AI");
        return latest
          ? rememberTranscriptTurn(previous, { ...latest, interrupted: true })
          : previous;
      });
    if (event.type === "response.done") {
      responding.current = false;
      if (!playing.current) setStatus("Listening");
      if (object(event.response).status === "failed")
        setError("OpenAI could not complete that response. You can try again.");
      sendPending();
    }
    const human =
      event.type === "conversation.item.input_audio_transcription.completed";
    const ai =
      event.type === "response.output_audio_transcript.done" ||
      event.type === "response.output_text.done";
    if (human || ai) {
      const text = event.transcript ?? event.text;
      const id = event.item_id;
      if (typeof text === "string" && typeof id === "string")
        setTranscript((previous) =>
          rememberTranscriptTurn(previous, {
            id,
            speaker: human ? "You" : "AI",
            text,
          }),
        );
    }
    if (event.type === "error") {
      const upstream = object(event.error);
      const code =
        typeof upstream.code === "string" &&
        /^[a-zA-Z0-9_.-]{1,100}$/.test(upstream.code)
          ? upstream.code
          : "provider_error";
      const rejected =
        pendingUpdate.current && upstream.event_id === pendingUpdate.current.id
          ? pendingUpdate.current
          : null;
      log({
        status: "rejected",
        ...(rejected ? { requestId: rejected.id } : {}),
        errorCode: code,
      });
      if (rejected) {
        if (updateTimeout.current) clearTimeout(updateTimeout.current);
        pendingUpdate.current = null;
        setPending(false);
      }
      setError(
        code === "input_audio_buffer_commit_empty"
          ? "There is no new speech to submit. Speak before finishing your turn."
          : `OpenAI rejected an operation (${code}). The confirmed settings remain visible below.`,
      );
    }
    if (event.type === "playback.blocked")
      setError(
        "The browser blocked audio playback. Leave and start again using the Live button.",
      );
  };
  const start = async (restartOf?: string) => {
    if (abort.current) return;
    setConsent(false);
    if (!draft.transcription)
      setTranscript((previous) =>
        markTranscriptGap(
          previous,
          "Input transcription was disabled for part of the conversation.",
        ),
      );
    setError("");
    setStatus("Connecting");
    setEffective(null);
    setRestartRequired(false);
    hasSpoken.current = false;
    currentVoice.current = draft.voice;
    const controller = new AbortController();
    abort.current = controller;
    const id = crypto.randomUUID();
    recordId.current = id;
    const now = new Date().toISOString();
    persist([
      ...recordsRef.current.slice(-19),
      {
        version: 1,
        id,
        startedAt: now,
        model: VOICE_MODEL,
        browser: navigator.userAgent.slice(0, 500),
        build: availability.build ?? "unknown",
        notes: "",
        events: [{ at: now, status: "requested", requested: draft }],
      },
    ]);
    try {
      const active = await connectSupervisedVoice(
        canvasId,
        draft,
        receive,
        (state) => {
          if (state === "microphone") setStatus("Waiting for microphone");
          if (state === "connecting") setStatus("Connecting");
          if (state === "disconnected") {
            setStatus("Reconnecting");
            if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
            reconnectTimer.current = setTimeout(() => {
              setError(
                "The connection did not recover within 10 seconds. Start again when ready.",
              );
              finishRef.current();
            }, 10000);
          }
          if (state === "connected") {
            if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
            setStatus("Listening");
          }
          if (state === "failed" || state === "closed") {
            setError(
              "The connection ended. Your captions remain here until you leave or reload.",
            );
            finishRef.current();
          }
        },
        controller.signal,
        restartOf,
      );
      if (controller.signal.aborted) {
        active.close();
        return;
      }
      connection.current = active;
      setStatus("Listening");
      setRemaining(
        Math.max(
          0,
          Math.ceil((Date.parse(active.expiresAt) - Date.now()) / 1000),
        ),
      );
    } catch (cause) {
      if (!controller.signal.aborted) {
        log({ status: "rejected", errorCode: "connection_failed" });
        setError(
          cause instanceof Error ? cause.message : "Voice could not connect.",
        );
      }
      finishRef.current();
    }
  };
  const apply = () => {
    const valid = voiceSettingsSchema.safeParse(draft);
    if (!valid.success || pendingUpdate.current || !connection.current) return;
    if (hasSpoken.current && draft.voice !== currentVoice.current) {
      setRestartRequired(true);
      log({ status: "restart_required", requested: draft });
      return;
    }
    const update = {
      id: crypto.randomUUID(),
      settings: { ...draft },
      sent: false,
    };
    pendingUpdate.current = update;
    setPending(true);
    setError("");
    log({ status: "requested", requestId: update.id, requested: draft });
    sendPending();
  };
  return (
    <>
      {controlTarget &&
        createPortal(
          <VoiceControlButton
            active={connected}
            connecting={connecting}
            muted={muted}
            status={status}
            settingsOpen={panel}
            onSettings={(button) => {
              setInvoker(button);
              setPanel(true);
            }}
            onAction={(button) => {
              setInvoker(button);
              if (connected || connecting) finish();
              else if (availability.enabled) setConsent(true);
              else {
                setError(availability.reason ?? "Voice is unavailable.");
                setPanel(true);
              }
            }}
          />,
          controlTarget,
        )}
      {panel && (
        <WorkspacePanel
          panelId="voice-settings-panel"
          title="Voice settings"
          invoker={invoker}
          onDismiss={() => setPanel(false)}
        >
          <div
            className="mb-4 flex flex-wrap items-center gap-2"
            onKeyDown={(event) => event.stopPropagation()}
          >
            {!availability.enabled && !connecting && !connected && (
              <span role="status" className="max-w-64 text-xs">
                {availability.reason}
                {availability.refreshRequired && (
                  <Button
                    variant="outline"
                    onClick={() => window.location.reload()}
                  >
                    Refresh preview
                  </Button>
                )}
              </span>
            )}
            <span role="status" className="text-xs">
              {muted && connected ? "Muted" : status}
              {connected
                ? ` · ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`
                : ""}
            </span>
            {connected && (
              <>
                <Button
                  variant="outline"
                  aria-label={muted ? "Unmute microphone" : "Mute microphone"}
                  onClick={() => {
                    connection.current?.mute(!muted);
                    setMuted(!muted);
                  }}
                >
                  {muted ? <MicOff /> : <Mic />}
                </Button>
                <Button variant="outline" onClick={finish}>
                  <PhoneOff aria-hidden="true" />
                  Leave
                </Button>
              </>
            )}
            {(connected ||
              transcript.turns.length > 0 ||
              coverageWarnings.length > 0) && (
              <Button
                variant="outline"
                onClick={() => setShowCaptions(!showCaptions)}
              >
                Captions
              </Button>
            )}
            {connected &&
              effective &&
              (object(object(effective.audio).input).turn_detection === null ||
                object(object(object(effective.audio).input).turn_detection)
                  .create_response === false) && (
                <div className="flex flex-wrap gap-2">
                  {object(object(effective.audio).input).turn_detection ===
                    null && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        connection.current?.send({
                          type: "input_audio_buffer.commit",
                        })
                      }
                    >
                      Finish my turn
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={() =>
                      connection.current?.send({ type: "response.create" })
                    }
                  >
                    Respond
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      connection.current?.send({ type: "response.cancel" });
                      connection.current?.send({
                        type: "output_audio_buffer.clear",
                      });
                    }}
                  >
                    Stop response
                  </Button>
                </div>
              )}
          </div>
          <p className="mb-4 text-sm text-zinc-600">
            {availability.enabled
              ? `Shared daily allowance: $${((availability.spentCents ?? 0) / 100).toFixed(2)} conservatively charged; $${((availability.reservedCents ?? 0) / 100).toFixed(2)} reserved. $20 limit, resets at midnight Pacific.`
              : availability.reason}
          </p>
          {error && (
            <p role="alert" className="mb-4 text-sm text-red-700">
              {error}
            </p>
          )}
          {availability.pendingSessionId && (
            <Button
              variant="outline"
              onClick={async () => {
                const response = await fetch(
                  `/api/canvases/${canvasId}/voice?id=${availability.pendingSessionId}`,
                  { method: "DELETE" },
                );
                setError(
                  response.ok
                    ? "The failed call is ended. Unverified usage remains conservatively accounted for."
                    : "Termination is not yet confirmed. You can retry ending the failed test.",
                );
                if (response.ok)
                  setAvailability((value) => ({
                    ...value,
                    pendingSessionId: undefined,
                  }));
              }}
            >
              Retry ending failed test
            </Button>
          )}
          <Button
            variant="outline"
            disabled={validating}
            onClick={async () => {
              setValidating(true);
              setValidation("");
              try {
                const response = await fetch(
                  `/api/canvases/${canvasId}/voice/live-readiness`,
                );
                const result = await response.json();
                setValidation(
                  response.ok && result.available
                    ? "GPT-Live model access confirmed. No voice session was opened. Migration is still in progress."
                    : "GPT-Live access could not be confirmed by this deployment. No voice session was opened.",
                );
              } catch {
                setValidation(
                  "The GPT-Live access check could not reach the deployment.",
                );
              } finally {
                setValidating(false);
              }
            }}
          >
            Check GPT-Live access
          </Button>
          <VoiceSettingsPanel
            validating={validating}
            validation={validation}
            onValidate={() => {
              const version = ++validationRequest.current;
              setValidating(true);
              setValidation("");
              void fetch(`/api/canvases/${canvasId}/voice/validate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(draft),
              })
                .then(async (response) => {
                  const result = await response.json();
                  if (version !== validationRequest.current) return;
                  setValidation(
                    response.ok
                      ? "OpenAI accepted this configuration. No audio session was opened; active settings will be confirmed again when you connect."
                      : (result.error ?? "Configuration check failed."),
                  );
                })
                .catch(() =>
                  setValidation(
                    "Configuration check could not reach the server.",
                  ),
                )
                .finally(() => setValidating(false));
            }}
            draft={draft}
            onDraft={(next) => {
              setDraft(next);
              validationRequest.current++;
              setValidation("");
              setRestartRequired(
                Boolean(
                  connection.current &&
                  hasSpoken.current &&
                  next.voice !== currentVoice.current,
                ),
              );
            }}
            effective={effective}
            pending={pending}
            connected={connected}
            onApply={apply}
            restartRequired={restartRequired}
            onRestart={() => {
              const previous = connection.current?.id;
              finish();
              restartTimer.current = setTimeout(
                () => void start(previous),
                2500,
              );
            }}
            presets={presets}
            onPresets={(next) => {
              try {
                localStorage.setItem(keys.presets, serializeVoicePresets(next));
                setPresets(next);
              } catch {
                setError("Presets could not be saved in this browser.");
              }
            }}
            records={records}
            onNotes={(id, notes) =>
              persist(
                recordsRef.current.map((record) =>
                  record.id === id ? { ...record, notes } : record,
                ),
              )
            }
            onDeleteRecord={(id) =>
              persist(recordsRef.current.filter((record) => record.id !== id))
            }
          />
        </WorkspacePanel>
      )}
      {consent && (
        <WorkspacePanel
          panelId="voice-consent-panel"
          title="Start a live test"
          invoker={invoker}
          onDismiss={() => setConsent(false)}
        >
          <div className="space-y-4 text-sm">
            <p>
              Your microphone audio goes to OpenAI for this live conversation.
              Thinking Canvas does not save audio or automatically save
              transcripts.
            </p>
            <p>
              Captions stay temporarily in this canvas until you reload or
              leave. Test settings and your notes stay in this browser for
              troubleshooting.
            </p>
            <p>
              This test lasts up to 10 minutes and shares a $20 daily testing
              allowance. Canvas actions are not available yet. You can
              explicitly save available captions as a canvas document.
            </p>
            <Button onClick={() => void start()}>
              Allow microphone and start
            </Button>
          </div>
        </WorkspacePanel>
      )}
      {!panel && error && (
        <p
          role="alert"
          className="absolute top-24 right-4 z-50 w-[min(28rem,calc(100%-2rem))] rounded-lg border border-red-200 bg-white p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {connected && remaining <= 60 && (
        <p
          role="status"
          className="absolute bottom-36 left-4 z-50 rounded-lg bg-amber-50 p-2 text-sm text-amber-900"
        >
          This test ends in {remaining} seconds.
        </p>
      )}
      {showCaptions && (
        <div className="absolute top-24 left-4 z-40 max-h-60 w-[min(28rem,calc(100%-2rem))] overflow-auto rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-900">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Temporary captions</h2>
            <Button variant="ghost" onClick={() => setShowCaptions(false)}>
              Hide
            </Button>
          </div>
          {coverageWarnings.length > 0 && (
            <p role="status" className="mb-2 text-xs text-amber-800">
              {coverageWarnings.join(" ")}
            </p>
          )}
          <p className="mb-2 text-xs text-zinc-500">
            May be incomplete; interrupted AI speech may include words you did
            not hear. Most recent 200 turns only. Not saved on reload.
          </p>
          <Button
            variant="outline"
            disabled={
              !canSaveTranscript ||
              !captions.length ||
              savedTranscript === availableTranscriptText(transcript)
            }
            onClick={(event) => {
              setInvoker(event.currentTarget);
              setSaveError("");
              setSavePreview({
                text: availableTranscriptText(transcript),
                gaps: coverageWarnings,
              });
            }}
          >
            Save transcript as document
          </Button>
          {!canSaveTranscript && (
            <p className="text-xs">
              Editing access and a connected, saved canvas are required.
            </p>
          )}
          {savedTranscript && (
            <p role="status" className="text-xs">
              Transcript added to the canvas. Check the canvas save indicator
              before leaving.
            </p>
          )}
          {captions.map((caption) => (
            <p key={caption.id} className="mb-2">
              <strong>{caption.speaker}: </strong>
              {caption.text}
            </p>
          ))}
        </div>
      )}
      {savePreview && (
        <WorkspacePanel
          title="Save conversation transcript"
          invoker={invoker}
          onDismiss={() => setSavePreview(null)}
        >
          <p>
            This saves the text shown below as an ordinary canvas document
            visible to canvas members. No audio is saved. Later speech is not
            added automatically.
          </p>
          <p className="my-2 text-sm">
            Transcriptions can contain errors. Interrupted AI text may contain
            words you did not hear.
          </p>
          {savePreview.gaps.length > 0 && (
            <p role="status" className="my-2 text-amber-800">
              This is an incomplete transcript. {savePreview.gaps.join(" ")}
            </p>
          )}
          <pre className="my-3 max-h-64 overflow-auto text-sm whitespace-pre-wrap">
            {savePreview.text}
          </pre>
          {saveError && <p role="alert">{saveError}</p>}
          <Button
            disabled={!canSaveTranscript}
            onClick={() => {
              try {
                const disclosure = savePreview.gaps.length
                  ? `Coverage: Incomplete transcript. ${savePreview.gaps.join(" ")}\n\n`
                  : "";
                onSaveTranscript(
                  `${disclosure}Temporary conversation transcript. Transcriptions may contain errors.\n\n${savePreview.text}`,
                );
                setSavedTranscript(savePreview.text);
                setSavePreview(null);
                setShowCaptions(false);
              } catch (error) {
                setSaveError(
                  error instanceof Error
                    ? error.message
                    : "Could not create the document.",
                );
              }
            }}
          >
            {savePreview.gaps.length
              ? "Save available portion"
              : "Save document"}
          </Button>
          <Button variant="ghost" onClick={() => setSavePreview(null)}>
            Cancel
          </Button>
        </WorkspacePanel>
      )}
    </>
  );
}
