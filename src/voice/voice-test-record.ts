import { z } from "zod";
import {
  effectiveVoiceSettings,
  voiceSettingsSchema,
  type VoiceSettings,
} from "./voice-settings";

const settingsEventSchema = z.strictObject({
  at: z.string().datetime(),
  status: z.enum([
    "requested",
    "accepted",
    "rejected",
    "restart_required",
    "ended",
  ]),
  requestId: z.string().max(100).optional(),
  requested: voiceSettingsSchema.optional(),
  effective: z.record(z.string(), z.unknown()).optional(),
  // Provider messages can echo conversation data. Store a code, never the raw error.
  errorCode: z
    .string()
    .regex(/^[a-zA-Z0-9_.-]{1,100}$/)
    .optional(),
});
export type VoiceSettingsEvent = z.infer<typeof settingsEventSchema>;
const recordSchema = z.strictObject({
  version: z.literal(1),
  id: z.string().uuid(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  model: z.string().max(100),
  browser: z.string().max(500),
  build: z.string().max(200),
  notes: z.string().max(4000),
  events: z.array(settingsEventSchema).max(200),
});
export type VoiceTestRecord = z.infer<typeof recordSchema>;
export type VoicePreset = { name: string; settings: VoiceSettings };
const presetsSchema = z
  .array(
    z.strictObject({
      name: z.string().trim().min(1).max(80),
      settings: voiceSettingsSchema,
    }),
  )
  .max(20);

/** Validate again at the persistence boundary; unknown fields are never serialized. */
export function sanitizeVoiceRecord(value: unknown): VoiceTestRecord {
  const record = recordSchema.parse(value);
  return {
    ...record,
    events: record.events.map((event) => ({
      ...event,
      ...(event.effective
        ? { effective: effectiveVoiceSettings(event.effective) }
        : {}),
    })),
  };
}
export function appendVoiceEvent(
  record: VoiceTestRecord,
  event: VoiceSettingsEvent,
): VoiceTestRecord {
  if (record.events.length >= 200)
    throw new Error(
      "The settings record is full. End this test before changing more settings.",
    );
  return sanitizeVoiceRecord({ ...record, events: [...record.events, event] });
}
export function voiceStorageKeys(userId: string, canvasId: string) {
  const prefix = `thinking-canvas:voice:${userId}:${canvasId}`;
  return { records: `${prefix}:records:v1`, presets: `${prefix}:presets:v1` };
}
export function readVoiceRecords(
  storage: Pick<Storage, "getItem">,
  key: string,
): VoiceTestRecord[] {
  const raw = storage.getItem(key);
  if (!raw) return [];
  const records = z.array(z.unknown()).max(20).parse(JSON.parse(raw));
  return records.map(sanitizeVoiceRecord);
}
export function writeVoiceRecords(
  storage: Pick<Storage, "setItem">,
  key: string,
  records: VoiceTestRecord[],
) {
  storage.setItem(
    key,
    JSON.stringify(records.slice(-20).map(sanitizeVoiceRecord)),
  );
}
export function parseVoicePresets(json: string): VoicePreset[] {
  if (json.length > 150_000) throw new Error("Preset file is too large.");
  return presetsSchema.parse(JSON.parse(json));
}
export function serializeVoicePresets(presets: VoicePreset[]) {
  return JSON.stringify(presetsSchema.parse(presets), null, 2);
}
