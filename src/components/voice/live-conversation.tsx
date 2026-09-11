"use client";
import { useEffect, useRef, useState } from "react";
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
  const [draft, setDraft] = useState<LiveSettings>({
    ...DEFAULT_LIVE_SETTINGS,
  });
  const [panel, setPanel] = useState(false),
    [consent, setConsent] = useState(false),
    [invoker, setInvoker] = useState<HTMLButtonElement | null>(null);
  const [status, setStatus] = useState("Ended"),
    [muted, setMuted] = useState(false),
    [error, setError] = useState("");
  const [availability, setAvailability] = useState<{
    enabled: boolean;
    reason?: string;
    spentCents?: number;
    reservedCents?: number;
    build?: string;
  }>({ enabled: false, reason: "Checking voice availability…" });
  const [remaining, setRemaining] = useState(600),
    [captions, setCaptions] = useState(false);
  const [transcript, setTranscript] =
      useState<ConversationTranscript>(emptyTranscript),
    [preview, setPreview] = useState<string | null>(null),
    [saved, setSaved] = useState("");
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
    const check = async () => {
      try {
        const response = await fetch(`/api/canvases/${canvasId}/voice`);
        if (!mounted.current) return;
        if (!response.ok) {
          setAvailability({
            enabled: false,
            reason:
              "Voice access is unavailable. Refresh if preview access expired.",
          });
          return;
        }
        const data = await response.json();
        if (mounted.current) setAvailability(data);
      } catch {
        if (mounted.current)
          setAvailability({
            enabled: false,
            reason: "Voice availability could not be checked.",
          });
      }
    };
    void check();
    const timer = setInterval(check, 15000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
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
      setRemaining(seconds);
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
    const settings = liveSettingsSchema.safeParse(draft);
    if (!settings.success) {
      setError("Check the voice settings before starting.");
      return;
    }
    setConsent(false);
    setError("");
    sessionId.current = null;
    setStatus("Connecting");
    setMuted(false);
    const controller = new AbortController();
    abort.current = controller;
    const id = crypto.randomUUID();
    runId.current = id;
    generation.current = id;
    offset.current = Date.now();
    accumulator.current.markGap(
      "Conversation boundaries and any unsent speech are not a complete transcript.",
    );
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
            session?: {
              model?: string;
              audio?: { output?: { voice?: string } };
            };
            usage?: { seconds?: number };
          };
          accumulator.current.append(value, id, offset.current);
          setTranscript(accumulator.current.snapshot());
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
            finishRef.current("Provider session closed");
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
          if (state === "failed" || state === "closed")
            finishRef.current("Voice connection ended");
        },
        controller.signal,
        restartOf,
        restartOf
          ? availableTranscriptText(accumulator.current.snapshot()).slice(-1500)
          : undefined,
      );
      if (controller.signal.aborted) {
        result.close();
        return;
      }
      connection.current = result;
      sessionId.current = result.id;
      updateRun({ sessionId: result.id });
      limit.current = Date.parse(result.expiresAt);
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
  const text = availableTranscriptText(transcript);
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
            onAction={(button) => {
              setInvoker(button);
              if (active || connecting) finish();
              else if (availability.enabled) {
                setPanel(false);
                setConsent(true);
              } else {
                setError(availability.reason ?? "Voice unavailable.");
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
          <div className="space-y-4 text-sm">
            <p role="status">
              {status}
              {active
                ? ` · ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}${muted ? " · Microphone muted" : " · Listening"}`
                : ""}
            </p>
            <p>
              {availability.enabled
                ? `Shared daily allowance: $${((availability.spentCents ?? 0) / 100).toFixed(2)} conservatively charged; $${((availability.reservedCents ?? 0) / 100).toFixed(2)} reserved. $20 limit, resets at midnight Pacific.`
                : availability.reason}
            </p>
            <p>
              GPT-Live bills session time, including silence and mute. Settings
              below apply when starting a new session. Closing this panel keeps
              voice connected.
            </p>
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
              {active && (
                <>
                  <Button
                    variant="outline"
                    disabled={backendPending}
                    onClick={async () => {
                      const response = await fetch(
                        `/api/canvases/${canvasId}/voice`,
                        {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            id: sessionId.current,
                            describeThisCanvas: true,
                          }),
                        },
                      );
                      setTaskNotice(
                        response.ok
                          ? "Canvas description requested. Its request and result appear in Comments."
                          : "The canvas description could not be requested.",
                      );
                    }}
                  >
                    Describe this canvas
                  </Button>
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
              <Button
                variant="outline"
                aria-expanded={captions}
                onClick={() => setCaptions(!captions)}
              >
                {captions ? "Hide captions" : "View captions"}
              </Button>
              <Button
                variant="outline"
                disabled={!text || text === saved || !canSaveTranscript}
                onClick={() => setPreview(text)}
              >
                Save available transcript
              </Button>
            </div>
            {active && (
              <p role="status">
                {backendPending ? "Reading the canvas…" : taskNotice}
              </p>
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
            <p>
              Initiative and interruption preferences are conversational
              guidance, not API permissions. This version can describe the
              canvas but cannot edit it yet.
            </p>
            <label className="block">
              Idle timeout (seconds)
              <input
                aria-label="Idle timeout (seconds)"
                type="number"
                min={30}
                max={300}
                value={draft.idleSeconds}
                onChange={(e) =>
                  setDraft({ ...draft, idleSeconds: Number(e.target.value) })
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
            <Button
              variant="outline"
              onClick={() => setDraft({ ...DEFAULT_LIVE_SETTINGS })}
            >
              Reset to baseline
            </Button>
            <p>
              Changing voice or replacing instructions requires an explicit
              restart. The original ten-minute deadline still applies. A restart
              carries a partial text excerpt from this tab; no recording is
              stored.
            </p>
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
            <details>
              <summary>Historical Realtime presets and records</summary>
              <p>
                Read-only export; unsupported Realtime controls are not sent to
                GPT-Live.
              </p>
              <Button
                variant="outline"
                onClick={() =>
                  exportJson("realtime-voice-history.json", {
                    presets: parseVoicePresets(
                      localStorage.getItem(legacyKeys.presets) ?? "[]",
                    ),
                    records: readVoiceRecords(localStorage, legacyKeys.records),
                  })
                }
              >
                Export Realtime history
              </Button>
            </details>
            <h3>Test records</h3>
            <p>
              Settings and notes only, saved locally for this account and
              canvas. No audio or transcript is stored in these records.
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
              Up to ten minutes. GPT-Live voice costs $0.05 per minute,
              including silence and mute. The shared testing limit is $20 daily.
              Idle voice ends after a warning.
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
          title="Save available transcript"
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
      {error && (
        <div
          role="alert"
          className="absolute top-24 right-4 z-50 w-[min(28rem,calc(100%-2rem))] rounded-lg border border-red-200 bg-white p-3 text-sm text-red-700"
        >
          {error}
          <Button variant="outline" onClick={() => setError("")}>
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
      {active && remaining <= 60 && (
        <p
          role="status"
          className="absolute top-24 right-4 z-40 rounded-lg bg-amber-50 p-3"
        >
          Voice ends in {remaining} seconds.
        </p>
      )}
    </>
  );
}
