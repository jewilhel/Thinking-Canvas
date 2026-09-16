"use client";
import styles from "./voice-settings.module.css";
import { useEffect, useRef, useState } from "react";
import { useSavedVoiceSettings } from "@/voice/use-saved-voice-settings";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { WorkspacePanel } from "@/components/canvas/workspace-panel";
import { VoiceControlButton } from "./voice-control-button";
import {
  DEFAULT_LIVE_SETTINGS,
  LIVE_MODEL,
  liveSettingsSchema,
  type LiveSettings,
} from "@/voice/live-protocol";
import { connectLiveVoice } from "@/voice/live-webrtc";
import type { SupervisedVoice } from "@/voice/supervised-webrtc";
import { LiveTranscript } from "@/voice/live-transcript";
import {
  availableTranscriptText,
  emptyTranscript,
  type ConversationTranscript,
} from "@/voice/conversation-transcript";
import {
  readVoiceRecords,
  parseVoicePresets,
  voiceStorageKeys,
} from "@/voice/voice-test-record";
import { z } from "zod";
import { useVoiceAvailability } from "@/voice/use-voice-availability";
const recordSchema = z.strictObject({
  version: z.literal(2),
  id: z.string(),
  model: z.literal(LIVE_MODEL),
  build: z.string(),
  startedAt: z.string(),
  endedAt: z.string().optional(),
  sessionId: z.uuid().optional(),
  requested: liveSettingsSchema,
  effective: z
    .object({ model: z.string(), voice: z.string().optional() })
    .optional(),
  reason: z.string().optional(),
  seconds: z.number().optional(),
  chargedCents: z.number().optional(),
  voiceUnits: z.number().nonnegative().optional(),
  backendUnits: z.number().nonnegative().optional(),
  finalUsage: z.boolean().optional(),
  notes: z.string().max(4000),
});
type Run = z.infer<typeof recordSchema>;
const presetSchema = z.strictObject({
  name: z.string().min(1).max(80),
  version: z.literal(2),
  settings: liveSettingsSchema,
});
type Preset = z.infer<typeof presetSchema>;
function exportJson(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function LiveVoice({
  canvasId,
  userId,
  controlTarget,
  canSaveTranscript,
  onSaveTranscript,
}: {
  canvasId: string;
  userId: string;
  controlTarget: HTMLElement | null;
  canSaveTranscript: boolean;
  onSaveTranscript: (text: string) => void;
}) {
  const legacyKeys = voiceStorageKeys(userId, canvasId),
    recordsKey = `${legacyKeys.records}:live:v2`,
    presetsKey = `${legacyKeys.presets}:live:v2`;
  const {
    draft,
    setDraft,
    ready: settingsReady,
    notice: settingsNotice,
    retry: retrySettings,
  } = useSavedVoiceSettings(userId);
  const [panel, setPanel] = useState(false),
    [consent, setConsent] = useState(false),
    [invoker, setInvoker] = useState<HTMLButtonElement | null>(null);
  const [status, setStatus] = useState("Ended"),
    [muted, setMuted] = useState(false),
    [error, setError] = useState("");
  const {
    availability,
    check: checkAvailability,
    renewPreviewAccess,
    accessError,
    setAccessError,
  } = useVoiceAvailability(canvasId);
  const startingCheck = useRef(false);
  const [windingDown, setWindingDown] = useState(false);
  const wrapUp = useRef<number | null>(null);
  const [remaining, setRemaining] = useState(600),
    [captions, setCaptions] = useState(false);
  const [transcript, setTranscript] =
      useState<ConversationTranscript>(emptyTranscript),
    [preview, setPreview] = useState<string | null>(null),
    [saved, setSaved] = useState("");
  const [captionSessions, setCaptionSessions] = useState<
    { id: string; startedAt: string }[]
  >([]);
  const [selectedSession, setSelectedSession] = useState("");
  const selectedSessionRef = useRef("");
  const endedGeneration = useRef("");
  const [records, setRecords] = useState<Run[]>(() => {
    try {
      return z
        .array(recordSchema)
        .max(20)
        .parse(JSON.parse(localStorage.getItem(recordsKey) ?? "[]"));
    } catch {
      return [];
    }
  });
  const [presets, setPresets] = useState<Preset[]>(() => {
    try {
      return z
        .array(presetSchema)
        .max(20)
        .parse(JSON.parse(localStorage.getItem(presetsKey) ?? "[]"));
    } catch {
      return [];
    }
  });
  const [backendPending, setBackendPending] = useState(false);
  const [taskNotice, setTaskNotice] = useState("");
  const [idleWarningAt, setIdleWarningAt] = useState<string | null>(null);
  const [presetName, setPresetName] = useState("");
  const connection = useRef<SupervisedVoice | null>(null),
    abort = useRef<AbortController | null>(null),
    accumulator = useRef(new LiveTranscript()),
    generation = useRef("");
  const recordsRef = useRef(records),
    runId = useRef<string | null>(null),
    sessionId = useRef<string | null>(null),
    offset = useRef(0),
    limit = useRef(0),
    mounted = useRef(true);
  const active = status === "Connected",
    connecting = status === "Connecting";
  const persist = (next: Run[]) => {
    const safe = z.array(recordSchema).max(20).parse(next.slice(0, 20));
    recordsRef.current = safe;
    setRecords(safe);
    try {
      localStorage.setItem(recordsKey, JSON.stringify(safe));
    } catch {
      setError("Test records could not be saved in this browser.");
    }
  };
  const updateRun = (changes: Partial<Run>) =>
    persist(
      recordsRef.current.map((r) =>
        r.id === runId.current ? { ...r, ...changes } : r,
      ),
    );
  const finish = (reason = "User ended session") => {
    if (endedGeneration.current === generation.current) return;
    endedGeneration.current = generation.current;
    connection.current?.close();
    connection.current = null;
    abort.current?.abort();
    abort.current = null;
    setStatus("Ended");
    setMuted(false);
    updateRun({ endedAt: new Date().toISOString(), reason });
  };
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      connection.current?.close();
      abort.current?.abort();
    };
  }, [canvasId]);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      const seconds = Math.max(
        0,
        Math.ceil((limit.current - Date.now()) / 1000),
      );
      const goodbye = wrapUp.current !== null && Date.now() >= wrapUp.current;
      setWindingDown(goodbye);
      setRemaining(
        goodbye || wrapUp.current === null
          ? seconds
          : Math.max(0, Math.ceil((wrapUp.current - Date.now()) / 1000)),
      );
      if (!seconds) finishRef.current("Session time limit");
    }, 1000);
    return () => clearInterval(timer);
  }, [active]);
  useEffect(() => {
    let disposed = false,
      checking = false;
    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        for (const record of recordsRef.current
          .filter((r) => r.sessionId && r.chargedCents === undefined)
          .slice(0, 3)) {
          const response = await fetch(
            `/api/canvases/${canvasId}/voice?id=${record.sessionId}`,
          );
          if (!response.ok || disposed) continue;
          const data = await response.json();
          if (disposed) return;
          if (record.sessionId === sessionId.current) {
            setIdleWarningAt(data.idleWarningAt ?? null);
            setBackendPending(Boolean(data.backendPending));
            if (data.taskStatus === "completed")
              setTaskNotice(
                "Canvas request completed. See Comments for the result.",
              );
            if (data.taskStatus === "failed")
              setTaskNotice(
                "Canvas request failed. Check Comments before retrying.",
              );
            if (data.taskStatus === "cancelled")
              setTaskNotice("Voice task cancelled.");
            if (data.ended && connection.current)
              finishRef.current(data.reason ?? "Provider session ended");
          }
          if (
            data.settled &&
            typeof data.chargedCents === "number" &&
            typeof data.finalUsage === "boolean"
          ) {
            const next = recordsRef.current.map((r) =>
              r.id === record.id
                ? {
                    ...r,
                    chargedCents: data.chargedCents,
                    voiceUnits: data.voiceUnits,
                    backendUnits: data.backendUnits,
                    finalUsage: data.finalUsage,
                    reason:
                      typeof data.reason === "string" ? data.reason : "Ended",
                  }
                : r,
            );
            const safe = z.array(recordSchema).max(20).parse(next);
            recordsRef.current = safe;
            setRecords(safe);
            localStorage.setItem(recordsKey, JSON.stringify(safe));
          }
        }
      } catch {
        /* Unavailable final accounting stays pending. */
      } finally {
        checking = false;
      }
    };
    void check();
    const timer = setInterval(check, 2000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [canvasId, recordsKey, status, records.length]);
  const start = async (restartOf?: string) => {
    if (abort.current) return;
    if (!settingsReady) {
      setError("Wait for saved voice settings to load before starting.");
      return;
    }
    const settings = liveSettingsSchema.safeParse(draft);
    if (!settings.success) {
      setError("Check the voice settings before starting.");
      return;
    }
    setConsent(false);
    setError("");
    sessionId.current = null;
    setStatus("Connecting");
    setWindingDown(false);
    setMuted(false);
    setBackendPending(false);
    setTaskNotice("");
    setIdleWarningAt(null);
    const controller = new AbortController();
    abort.current = controller;
    const previousSession = captionSessions.find(
      (session) => accumulator.current.snapshot(session.id).turns.length > 0,
    );
    const previousSnapshot = previousSession
      ? accumulator.current.snapshot(previousSession.id)
      : null;
    const previousConversation =
      previousSession && previousSnapshot
        ? {
            ...previousSession,
            text: availableTranscriptText(previousSnapshot),
            gaps: previousSnapshot.gaps,
          }
        : undefined;
    const id = crypto.randomUUID();
    runId.current = id;
    generation.current = id;
    offset.current = Date.now();
    selectedSessionRef.current = id;
    setSelectedSession(id);
    setCaptionSessions((sessions) => [
      { id, startedAt: new Date(offset.current).toISOString() },
      ...sessions,
    ]);
    setTranscript(accumulator.current.snapshot(id));
    persist([
      {
        version: 2,
        id,
        model: LIVE_MODEL,
        build: availability.build ?? "unknown",
        startedAt: new Date().toISOString(),
        requested: settings.data,
        notes: "",
      },
      ...recordsRef.current,
    ]);
    try {
      const result = await connectLiveVoice(
        canvasId,
        settings.data,
        (value) => {
          if (
            generation.current !== id ||
            !value ||
            typeof value !== "object" ||
            !("type" in value)
          )
            return;
          const event = value as {
            type: string;
            reason?: string;
            session?: {
              model?: string;
              audio?: { output?: { voice?: string } };
            };
            usage?: { seconds?: number };
          };
          accumulator.current.append(value, id, offset.current);
          if (selectedSessionRef.current === id)
            setTranscript(accumulator.current.snapshot(id));
          if (
            event.type === "session.started" &&
            event.session?.model === LIVE_MODEL
          )
            updateRun({
              effective: {
                model: event.session?.model ?? LIVE_MODEL,
                voice: event.session?.audio?.output?.voice,
              },
            });
          if (event.type === "session.closed") {
            if (typeof event.usage?.seconds === "number")
              updateRun({ seconds: event.usage.seconds });
            finishRef.current(
              event.reason === "close_requested"
                ? "Session ended"
                : "Provider session closed",
            );
          }
          if (event.type === "error")
            setError(
              "The voice provider reported an error. End and retry the session.",
            );
          if (event.type === "playback.blocked")
            setError(
              "Audio playback was blocked by the browser. End and restart voice.",
            );
        },
        (state) => {
          if (
            generation.current === id &&
            (state === "failed" || state === "closed")
          )
            finishRef.current("Voice connection ended");
        },
        controller.signal,
        restartOf,
        restartOf ? previousConversation?.text.slice(-1500) : undefined,
        undefined,
        previousConversation,
      );
      if (controller.signal.aborted) {
        result.close();
        return;
      }
      connection.current = result;
      sessionId.current = result.id;
      updateRun({ sessionId: result.id });
      limit.current = Date.parse(result.expiresAt);
      wrapUp.current = result.wrapUpAt ? Date.parse(result.wrapUpAt) : null;
      setStatus("Connected");
    } catch (failure) {
      const failed = z
        .object({ sessionId: z.uuid() })
        .safeParse(failure instanceof Error ? failure.cause : null);
      if (failed.success) {
        sessionId.current = failed.data.sessionId;
        updateRun({ sessionId: failed.data.sessionId });
      }
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : "Voice connection failed.",
        );
      finishRef.current("Connection failed");
    }
  };
  const selectedCaptionSession = captionSessions.find(
    (session) => session.id === selectedSession,
  );
  const sessionLabel = selectedCaptionSession
    ? new Date(selectedCaptionSession.startedAt).toLocaleString()
    : "";
  const text = availableTranscriptText(transcript);
  const documentText = text
    ? `Voice conversation — ${sessionLabel}\n\n${text}`
    : "";
  return (
    <>
      {controlTarget &&
        createPortal(
          <VoiceControlButton
            active={active}
            connecting={connecting}
            muted={muted}
            status={status}
            settingsOpen={panel}
            onSettings={(button) => {
              setInvoker(button);
              setPanel(true);
            }}
            onAction={async (button) => {
              setInvoker(button);
              if (active || connecting) {
                finish();
                return;
              }
              if (startingCheck.current) return;
              startingCheck.current = true;
              setAccessError("");
              try {
                const current = availability.needsPreviewAccess
                  ? await renewPreviewAccess()
                  : await checkAvailability();
                if (!mounted.current) return;
                if (current.enabled) {
                  setPanel(false);
                  setConsent(true);
                } else {
                  setAccessError(current.reason ?? "Voice unavailable.");
                }
              } finally {
                startingCheck.current = false;
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
          <div className={styles.panel}>
            <section className={styles.card} aria-label="Session">
              <h3>Session</h3>
              <p role="status" className={styles.status}>
                {windingDown && active ? "Wrapping up" : status}
                {active
                  ? ` · ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}${muted ? " · Microphone muted" : " · Listening"}`
                  : ""}
              </p>
              {!availability.enabled && availability.reason && (
                <p className={styles.notice}>{availability.reason}</p>
              )}
              {active && (
                <p className={styles.help}>
                  Closing settings keeps the conversation connected.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {active && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      connection.current?.mute(!muted);
                      setMuted(!muted);
                    }}
                  >
                    {muted ? "Unmute microphone" : "Mute microphone"}
                  </Button>
                )}
                {active && backendPending && (
                  <>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        const response = await fetch(
                          `/api/canvases/${canvasId}/voice`,
                          {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              id: sessionId.current,
                              cancelTask: true,
                            }),
                          },
                        );
                        setTaskNotice(
                          response.ok
                            ? "Task cancellation requested."
                            : "Task cancellation failed; end the session to stop work.",
                        );
                      }}
                    >
                      Cancel voice task
                    </Button>
                  </>
                )}
                {(active || connecting) && (
                  <Button variant="outline" onClick={() => finish()}>
                    End session
                  </Button>
                )}
              </div>
              {active && (backendPending || taskNotice) && (
                <p role="status" className={styles.help}>
                  {backendPending ? "Reading the canvas…" : taskNotice}
                </p>
              )}
            </section>
            <p className={styles.help} role="status">
              {settingsNotice}
            </p>
            {settingsNotice.includes("could not") ||
            settingsNotice.includes("Could not") ? (
              <Button onClick={retrySettings}>Retry saving settings</Button>
            ) : null}
            <fieldset
              disabled={!settingsReady}
              className={styles.card}
              aria-label="Voice and behavior"
            >
              <h3>Voice and behavior</h3>
              <p className={styles.help}>
                Changes save automatically and apply to your next session
                {active ? " or when you restart below" : ""}.
              </p>
              <label className="block">
                AI voice
                <select
                  aria-label="AI voice"
                  className="mt-1 block w-full rounded border p-2"
                  value={draft.voice}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      voice: e.target.value as LiveSettings["voice"],
                    })
                  }
                >
                  {liveSettingsSchema.shape.voice.options.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                Greeting
                <textarea
                  aria-label="Greeting"
                  className={styles.shortInstructions}
                  rows={3}
                  maxLength={1000}
                  placeholder="How should the AI greet you?"
                  value={draft.greeting}
                  onChange={(e) =>
                    setDraft({ ...draft, greeting: e.target.value })
                  }
                />
              </label>
              <label className="block">
                Conversation instructions
                <textarea
                  aria-label="Conversation instructions"
                  className="mt-1 min-h-32 w-full rounded border p-2"
                  maxLength={4000}
                  value={draft.instructions}
                  onChange={(e) =>
                    setDraft({ ...draft, instructions: e.target.value })
                  }
                />
              </label>
              <label className="block">
                Goodbye
                <textarea
                  aria-label="Goodbye"
                  className={styles.shortInstructions}
                  rows={3}
                  maxLength={1000}
                  placeholder="For example: End the session when our conversation has finished, after a warm goodbye."
                  value={draft.goodbye}
                  onChange={(e) =>
                    setDraft({ ...draft, goodbye: e.target.value })
                  }
                />
              </label>
              <div className={styles.idleFields}>
                <label className="block">
                  Idle timeout (seconds)
                  <input
                    aria-label="Idle timeout (seconds)"
                    type="number"
                    min={30}
                    max={300}
                    value={draft.idleSeconds}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        idleSeconds: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="block">
                  Idle warning (seconds)
                  <input
                    aria-label="Idle warning (seconds)"
                    type="number"
                    min={5}
                    max={30}
                    value={draft.idleWarningSeconds}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        idleWarningSeconds: Number(e.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <p className={styles.help}>
                After this much silence, a warning gives you time to resume
                before voice ends.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => setDraft({ ...DEFAULT_LIVE_SETTINGS })}
                >
                  Reset to baseline
                </Button>
                {active && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      const previous = sessionId.current;
                      finish("Restart requested");
                      if (previous) void start(previous);
                    }}
                  >
                    Restart with these settings
                  </Button>
                )}
              </div>
              {active && (
                <p className={styles.help}>
                  Restarting keeps the original conversation and goodbye
                  deadlines.
                </p>
              )}
            </fieldset>
            <section
              className={styles.card}
              aria-label="Conversation transcript"
            >
              <h3>Conversation transcript</h3>
              <p className={styles.help}>
                {captionSessions.length
                  ? "Save a conversation before closing or reloading this tab."
                  : "Your session captions will appear here. Save them to a document when you want to keep them."}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  aria-expanded={captions}
                  onClick={() => setCaptions(!captions)}
                >
                  {captions ? "Hide captions" : "View captions"}
                </Button>
                <Button
                  variant="outline"
                  disabled={
                    !text || documentText === saved || !canSaveTranscript
                  }
                  onClick={() => setPreview(documentText)}
                >
                  Save selected conversation
                </Button>
              </div>
              {captionSessions.length > 0 && (
                <label className="block">
                  Conversation
                  <select
                    aria-label="Transcript conversation"
                    className="mt-1 block w-full rounded border p-2"
                    value={selectedSession}
                    onChange={(event) => {
                      const id = event.target.value;
                      selectedSessionRef.current = id;
                      setSelectedSession(id);
                      setTranscript(accumulator.current.snapshot(id));
                    }}
                  >
                    {captionSessions.map((session, index) => (
                      <option key={session.id} value={session.id}>
                        {index === 0 ? "Latest — " : ""}
                        {new Date(session.startedAt).toLocaleString()}
                        {session.id === generation.current && active
                          ? " · In progress"
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {captions && (
                <section
                  aria-label="Temporary voice captions"
                  className="max-h-52 overflow-auto rounded-lg border p-3"
                >
                  <pre className="whitespace-pre-wrap">
                    {text || "No captions yet."}
                  </pre>
                </section>
              )}
            </section>
            <details className={styles.card}>
              <summary>Presets</summary>
              <div className={styles.detailsBody}>
                <label className="block">
                  Preset name
                  <input
                    aria-label="Preset name"
                    maxLength={80}
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                  />
                </label>
                <Button
                  disabled={
                    !presetName.trim() ||
                    !liveSettingsSchema.safeParse(draft).success
                  }
                  onClick={() => {
                    const next = [
                      {
                        name: presetName.trim(),
                        version: 2 as const,
                        settings: { ...draft },
                      },
                      ...presets.filter((p) => p.name !== presetName.trim()),
                    ].slice(0, 20);
                    setPresets(next);
                    localStorage.setItem(presetsKey, JSON.stringify(next));
                  }}
                >
                  Save preset
                </Button>
                {presets.map((p) => (
                  <Button
                    key={p.name}
                    variant="outline"
                    onClick={() => setDraft({ ...p.settings })}
                  >
                    Load {p.name}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  onClick={() => exportJson("live-voice-presets.json", presets)}
                >
                  Export presets
                </Button>
              </div>
            </details>
            <details className={styles.card}>
              <summary>Usage and test records</summary>
              <div className={styles.detailsBody}>
                <p className={styles.help}>
                  {availability.enabled
                    ? `Daily test budget: $${((availability.spentCents ?? 0) / 100).toFixed(2)} charged · $${((availability.reservedCents ?? 0) / 100).toFixed(2)} reserved · $20 limit.`
                    : "Usage is available when voice access is connected."}
                </p>
                <p className={styles.help}>
                  Ten-minute conversations with up to two minutes to wrap up.
                  Budget resets at midnight Pacific. Silence and mute count
                  toward voice usage.
                </p>
                <details>
                  <summary>Historical Realtime presets and records</summary>
                  <p>
                    Read-only export; unsupported Realtime controls are not sent
                    to GPT-Live.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() =>
                      exportJson("realtime-voice-history.json", {
                        presets: parseVoicePresets(
                          localStorage.getItem(legacyKeys.presets) ?? "[]",
                        ),
                        records: readVoiceRecords(
                          localStorage,
                          legacyKeys.records,
                        ),
                      })
                    }
                  >
                    Export Realtime history
                  </Button>
                </details>
                <p className={styles.help}>
                  Recorded settings, costs and notes for troubleshooting. No
                  audio or transcript text.
                </p>
                {records.map((r) => (
                  <details key={r.id}>
                    <summary>
                      {r.startedAt} · {r.endedAt ? "Ended" : "Started"}
                      {r.chargedCents !== undefined
                        ? ` · $${(r.chargedCents / 100).toFixed(2)}${r.finalUsage ? "" : " (unconfirmed estimate)"}`
                        : " · Accounting pending"}
                    </summary>
                    <pre className="max-h-64 overflow-auto text-xs whitespace-pre-wrap">
                      {JSON.stringify(r, null, 2)}
                    </pre>
                    <textarea
                      aria-label={`Notes for ${r.id}`}
                      maxLength={4000}
                      value={r.notes}
                      onChange={(e) =>
                        persist(
                          recordsRef.current.map((item) =>
                            item.id === r.id
                              ? { ...item, notes: e.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                    <Button
                      variant="outline"
                      onClick={() => exportJson(`live-voice-${r.id}.json`, r)}
                    >
                      Export record
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        persist(
                          recordsRef.current.filter((item) => item.id !== r.id),
                        )
                      }
                    >
                      Delete record
                    </Button>
                  </details>
                ))}
              </div>
            </details>
          </div>
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
              Your microphone goes to OpenAI for this conversation. Thinking
              Canvas saves no audio or automatic transcript; provider session
              storage is disabled.
            </p>
            <p>
              Ten minutes, plus up to two minutes to say goodbye. GPT-Live voice
              costs $0.05 per minute, including silence and mute. The shared
              testing limit is $20 daily. Idle voice ends after a warning.
            </p>
            <p>
              Captions remain temporarily in this tab. Save a transcript only
              when you explicitly choose to. Reloading clears unsaved text.
            </p>
            <Button onClick={() => void start()}>
              Allow microphone and start
            </Button>
          </div>
        </WorkspacePanel>
      )}
      {preview !== null && (
        <WorkspacePanel
          panelId="voice-transcript-save"
          title="Save selected conversation"
          invoker={invoker}
          onDismiss={() => setPreview(null)}
        >
          <div className="space-y-4">
            <p>
              This is a snapshot of available captions, not a complete
              recording. {transcript.gaps.join(" ")}
            </p>
            <pre className="max-h-64 overflow-auto text-sm whitespace-pre-wrap">
              {preview}
            </pre>
            <Button
              disabled={!canSaveTranscript || saved === preview}
              onClick={() => {
                try {
                  onSaveTranscript(preview);
                  setSaved(preview);
                  setPreview(null);
                } catch {
                  setError("The transcript document could not be saved.");
                }
              }}
            >
              Save partial transcript as canvas document
            </Button>
          </div>
        </WorkspacePanel>
      )}
      {(error || accessError) && (
        <div
          role="alert"
          className="absolute top-24 right-4 z-50 w-[min(28rem,calc(100%-2rem))] rounded-lg border border-red-200 bg-white p-3 text-sm text-red-700"
        >
          {error || accessError}
          <Button
            variant="outline"
            onClick={() => {
              setError("");
              setAccessError("");
            }}
          >
            Dismiss
          </Button>
        </div>
      )}
      {active && idleWarningAt && (
        <div
          role="alert"
          className="absolute top-24 right-4 z-50 rounded-lg bg-amber-50 p-3 text-sm"
        >
          Voice will end at {new Date(idleWarningAt).toLocaleTimeString()}{" "}
          unless speech resumes.{" "}
          <Button
            variant="outline"
            onClick={async () => {
              const response = await fetch(`/api/canvases/${canvasId}/voice`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  id: sessionId.current,
                  keepTalking: true,
                }),
              });
              if (response.ok) setIdleWarningAt(null);
              else setError("Could not extend the idle period.");
            }}
          >
            Keep talking
          </Button>
        </div>
      )}
      {active && (windingDown || remaining <= 60) && (
        <p
          role="status"
          className="absolute top-24 right-4 z-40 rounded-lg bg-amber-50 p-3"
        >
          {windingDown ? "Wrapping up — voice ends" : "Wrapping up starts"} in{" "}
          {remaining} seconds.
        </p>
      )}
    </>
  );
}
