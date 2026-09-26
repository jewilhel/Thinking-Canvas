"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_VOICE_SETTINGS,
  VOICE_SETTING_CONSTRAINTS,
  voiceSettingsSchema,
  type VoiceSettings,
} from "@/voice/voice-settings";
import {
  parseVoicePresets,
  serializeVoicePresets,
  type VoicePreset,
  type VoiceTestRecord,
} from "@/voice/voice-test-record";

export function downloadVoiceJson(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
type Props = {
  draft: VoiceSettings;
  onDraft: (settings: VoiceSettings) => void;
  effective: Record<string, unknown> | null;
  pending: boolean;
  connected: boolean;
  onValidate: () => void;
  validating: boolean;
  validation: string;
  onApply: () => void;
  onRestart: () => void;
  restartRequired: boolean;
  presets: VoicePreset[];
  onPresets: (presets: VoicePreset[]) => void;
  records: VoiceTestRecord[];
  onNotes: (id: string, notes: string) => void;
  onDeleteRecord: (id: string) => void;
};
const control =
  "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2 py-2 text-zinc-900 focus-visible:outline-2 focus-visible:outline-violet-600";
export function VoiceSettingsPanel(p: Props) {
  const [presetName, setPresetName] = useState("");
  const [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const set = <K extends keyof VoiceSettings>(
    key: K,
    value: VoiceSettings[K],
  ) => p.onDraft({ ...p.draft, [key]: value });
  const select = (
    key: keyof VoiceSettings,
    label: string,
    choices: string[],
    api: string,
  ) => (
    <label className="block text-sm" key={key}>
      {label}
      <select
        className={control}
        value={String(p.draft[key])}
        onChange={(event) =>
          set(key, event.target.value as VoiceSettings[typeof key])
        }
      >
        {choices.map((choice) => (
          <option key={choice}>{choice}</option>
        ))}
      </select>
      <small className="text-zinc-500">{api}</small>
    </label>
  );
  const number = (
    key: keyof VoiceSettings,
    label: string,
    min: number,
    max: number,
    step: number,
    api: string,
  ) => (
    <label className="block text-sm" key={key}>
      {label}
      <input
        className={control}
        type="number"
        min={min}
        max={max}
        step={step}
        value={Number(p.draft[key])}
        onChange={(event) => set(key, event.target.valueAsNumber)}
      />
      <small className="text-zinc-500">{api}</small>
    </label>
  );
  const check = (key: keyof VoiceSettings, label: string) => (
    <label className="flex items-start gap-2 text-sm" key={key}>
      <input
        className="mt-1 size-4"
        type="checkbox"
        checked={Boolean(p.draft[key])}
        onChange={(event) => set(key, event.target.checked)}
      />
      {label}
    </label>
  );
  return (
    <div className="space-y-5 text-zinc-900">
      <div className="space-y-2">
        <Button
          variant="outline"
          disabled={
            p.connected ||
            p.validating ||
            !voiceSettingsSchema.safeParse(p.draft).success
          }
          onClick={p.onValidate}
        >
          {p.validating ? "Checking configuration…" : "Check API compatibility"}
        </Button>
        <p className="text-sm text-zinc-600">
          Checks these settings using the deployed OpenAI connection, without
          microphone access or opening a media call.
        </p>
        {p.validation && (
          <p role="status" className="text-sm">
            {p.validation}
          </p>
        )}
      </div>
      <p className="text-sm text-zinc-600">
        Draft values become active only after OpenAI confirms them. Closing this
        panel keeps the call connected.
      </p>
      <fieldset className="space-y-3">
        <legend className="mb-2 font-semibold">Turn taking</legend>
        {select(
          "detection",
          "Detect a finished turn",
          ["semantic_vad", "server_vad", "manual"],
          "audio.input.turn_detection.type",
        )}
        {p.draft.detection === "semantic_vad" &&
          select(
            "eagerness",
            "How quickly to take a turn",
            ["auto", "low", "medium", "high"],
            "turn_detection.eagerness",
          )}
        {p.draft.detection === "server_vad" && (
          <>
            {number(
              "threshold",
              "Speech threshold",
              0,
              1,
              0.05,
              "turn_detection.threshold",
            )}
            {number(
              "silenceMs",
              "Silence before responding (ms)",
              200,
              6000,
              100,
              "turn_detection.silence_duration_ms",
            )}
            {number(
              "prefixMs",
              "Audio before speech (ms)",
              0,
              2000,
              100,
              "turn_detection.prefix_padding_ms",
            )}
            {number(
              "idleMs",
              "Idle prompt timeout (0 = off, otherwise 5000–30000 ms)",
              0,
              30000,
              1000,
              "turn_detection.idle_timeout_ms",
            )}
          </>
        )}
        {p.draft.detection !== "manual" && (
          <>
            {check(
              "automaticResponse",
              "Respond automatically when my turn ends",
            )}
            {check("interruptResponse", "Stop AI output when I begin speaking")}
          </>
        )}
        {p.draft.detection === "manual" && (
          <p className="text-sm">
            Use Finish my turn and Respond in the live controls.
          </p>
        )}
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="mb-2 font-semibold">Voice and input</legend>
        {select(
          "voice",
          "AI voice",
          [
            "marin",
            "cedar",
            "alloy",
            "ash",
            "ballad",
            "coral",
            "echo",
            "sage",
            "shimmer",
            "verse",
          ],
          "audio.output.voice — restart after first audio",
        )}
        {number(
          "speed",
          "Speech speed",
          0.25,
          1.5,
          0.05,
          "audio.output.speed — applied between responses",
        )}
        {select(
          "noiseReduction",
          "Microphone noise reduction",
          ["near_field", "far_field", "off"],
          "audio.input.noise_reduction.type",
        )}
        {check("transcription", "Transcribe my speech for temporary captions")}
        {p.draft.transcription && (
          <>
            <label className="block text-sm">
              Transcription language (blank = detect)
              <input
                className={control}
                value={p.draft.language}
                maxLength={12}
                placeholder="en"
                onChange={(e) => set("language", e.target.value)}
              />
            </label>
            <label className="block text-sm">
              Transcription vocabulary / context
              <textarea
                className={control}
                value={p.draft.transcriptionPrompt}
                maxLength={1000}
                onChange={(e) => set("transcriptionPrompt", e.target.value)}
              />
            </label>
          </>
        )}
      </fieldset>
      <label className="block text-sm">
        Conversation instructions
        <textarea
          className={control}
          rows={5}
          value={p.draft.instructions}
          maxLength={4000}
          onChange={(e) => set("instructions", e.target.value)}
        />
        <small>
          Guidance for conversation style; these do not grant canvas
          permissions.
        </small>
      </label>
      <details>
        <summary className="cursor-pointer font-semibold">
          Advanced API settings
        </summary>
        <div className="mt-3 space-y-3">
          {select(
            "output",
            "Response output",
            ["audio", "text"],
            "output_modalities",
          )}
          {number(
            "maxOutputTokens",
            "Maximum response tokens",
            32,
            4096,
            32,
            "max_output_tokens",
          )}
          {select(
            "reasoning",
            "Reasoning effort",
            ["low", "medium", "high"],
            "reasoning.effort",
          )}
          {number(
            "retentionRatio",
            "Context retained after truncation",
            0.1,
            1,
            0.05,
            "truncation.retention_ratio; conversation limit 8192 tokens",
          )}
          <dl className="space-y-3 text-sm">
            {VOICE_SETTING_CONSTRAINTS.map(([name, explanation]) => (
              <div key={name}>
                <dt className="font-medium">{name}</dt>
                <dd className="text-zinc-600">{explanation}</dd>
              </div>
            ))}
          </dl>
        </div>
      </details>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={
            !p.connected ||
            p.pending ||
            p.restartRequired ||
            !voiceSettingsSchema.safeParse(p.draft).success
          }
          onClick={p.onApply}
        >
          {p.pending ? "Waiting for confirmation…" : "Apply settings"}
        </Button>
        <Button
          variant="outline"
          onClick={() => p.onDraft({ ...DEFAULT_VOICE_SETTINGS })}
        >
          Reset to baseline
        </Button>
        {p.restartRequired && (
          <Button variant="outline" disabled={p.pending} onClick={p.onRestart}>
            Restart to change voice
          </Button>
        )}
      </div>
      {p.restartRequired && (
        <p className="text-sm text-amber-800">
          Restart resets OpenAI conversation context. It keeps the original
          10-minute deadline and your temporary captions.
        </p>
      )}
      <details>
        <summary className="cursor-pointer font-semibold">
          API-confirmed effective values
        </summary>
        <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-zinc-100 p-3 text-xs">
          {p.effective
            ? JSON.stringify(p.effective, null, 2)
            : "No API-confirmed session yet."}
        </pre>
      </details>
      <fieldset className="space-y-3">
        <legend className="mb-2 font-semibold">Local presets</legend>
        <label className="block text-sm">
          Preset name
          <input
            className={control}
            value={presetName}
            maxLength={80}
            onChange={(e) => setPresetName(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={
              !presetName.trim() ||
              !voiceSettingsSchema.safeParse(p.draft).success ||
              p.presets.length >= 20
            }
            onClick={() => {
              p.onPresets([
                ...p.presets.filter((x) => x.name !== presetName.trim()),
                { name: presetName.trim(), settings: { ...p.draft } },
              ]);
              setPresetName("");
            }}
          >
            Save preset
          </Button>
          <Button variant="outline" onClick={() => file.current?.click()}>
            Import presets
          </Button>
          <Button
            variant="outline"
            disabled={!p.presets.length}
            onClick={() =>
              downloadVoiceJson(
                "voice-presets.json",
                JSON.parse(serializeVoicePresets(p.presets)),
              )
            }
          >
            Export presets
          </Button>
        </div>
        <input
          ref={file}
          hidden
          type="file"
          accept="application/json,.json"
          onChange={async (e) => {
            const chosen = e.target.files?.[0];
            e.target.value = "";
            if (!chosen) return;
            try {
              if (chosen.size > 150000) throw new Error();
              p.onPresets(parseVoicePresets(await chosen.text()));
              setError("");
            } catch {
              setError(
                "Import failed. Choose a valid voice presets JSON file (maximum 150 KB).",
              );
            }
          }}
        />
        {p.presets.map((preset, index) => (
          <div
            className="flex items-center gap-2"
            key={`${preset.name}-${index}`}
          >
            <Button
              variant="outline"
              onClick={() => p.onDraft({ ...preset.settings })}
            >
              Load {preset.name}
            </Button>
            <Button
              variant="ghost"
              aria-label={`Delete preset ${preset.name}`}
              onClick={() =>
                p.onPresets(p.presets.filter((_, i) => i !== index))
              }
            >
              Delete
            </Button>
          </div>
        ))}
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <section className="space-y-3">
        <h3 className="font-semibold">Test records</h3>
        <p className="text-sm text-zinc-600">
          Stored in this browser for this account and canvas. Up to 20 tests.
          Settings, change history, and your notes only; no audio or transcript.
        </p>
        {!p.records.length && <p className="text-sm">No tests recorded yet.</p>}
        {[...p.records].reverse().map((record) => (
          <details
            key={record.id}
            className="rounded-lg border border-zinc-200 p-3"
          >
            <summary className="cursor-pointer text-sm">
              {new Date(record.startedAt).toLocaleString()} ·{" "}
              {record.endedAt ? "Ended" : "Started"}
            </summary>
            <label className="mt-3 block text-sm">
              Test notes
              <textarea
                className={control}
                maxLength={4000}
                value={record.notes}
                onChange={(e) => p.onNotes(record.id, e.target.value)}
              />
            </label>
            <pre className="my-3 max-h-60 overflow-auto bg-zinc-100 p-2 text-xs">
              {JSON.stringify(record, null, 2)}
            </pre>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  downloadVoiceJson(`voice-test-${record.id}.json`, record)
                }
              >
                Export test
              </Button>
              <Button
                variant="ghost"
                disabled={!record.endedAt}
                onClick={() => p.onDeleteRecord(record.id)}
              >
                Delete record
              </Button>
            </div>
          </details>
        ))}
      </section>
    </div>
  );
}
