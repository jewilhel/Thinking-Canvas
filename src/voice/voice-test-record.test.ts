import { describe, expect, it } from "vitest";
import { DEFAULT_VOICE_SETTINGS } from "./voice-settings";
import {
  appendVoiceEvent,
  parseVoicePresets,
  readVoiceRecords,
  sanitizeVoiceRecord,
  voiceStorageKeys,
  writeVoiceRecords,
  type VoiceTestRecord,
} from "./voice-test-record";
const record: VoiceTestRecord = {
  version: 1,
  id: "11111111-1111-4111-8111-111111111111",
  startedAt: "2026-09-09T12:00:00.000Z",
  model: "gpt-realtime-2.1",
  browser: "test",
  build: "test",
  notes: "",
  events: [],
};
describe("voice test records", () => {
  it("persists accepted settings across reload, keeping unknown payloads out", () => {
    const saved = appendVoiceEvent(record, {
      at: record.startedAt,
      status: "accepted",
      effective: {
        model: record.model,
        client_secret: "secret",
        transcript: "private",
        audio: {
          input: { transcription: { model: "gpt-4o-mini-transcribe" } },
        },
      },
    });
    let value = "";
    writeVoiceRecords(
      {
        setItem: (_key, next) => {
          value = next;
        },
      },
      "test",
      [saved],
    );
    expect(value).not.toContain("secret");
    expect(value).not.toContain("private");
    expect(
      readVoiceRecords({ getItem: () => value }, "test")[0].events[0].effective,
    ).toHaveProperty("audio.input.transcription.model");
  });
  it("keeps pending/rejected changes distinct from effective settings", () => {
    const saved = appendVoiceEvent(
      appendVoiceEvent(record, {
        at: record.startedAt,
        status: "requested",
        requested: DEFAULT_VOICE_SETTINGS,
        requestId: "one",
      }),
      {
        at: record.startedAt,
        status: "rejected",
        requestId: "one",
        errorCode: "invalid_value",
      },
    );
    expect(saved.events.every((event) => !event.effective)).toBe(true);
    expect(() =>
      sanitizeVoiceRecord({ ...record, transcript: "private" }),
    ).toThrow();
    expect(() =>
      appendVoiceEvent(record, {
        at: record.startedAt,
        status: "rejected",
        errorCode: "A provider message with private content",
      }),
    ).toThrow();
  });
  it("isolates identities and canvases and rejects unsafe imports", () => {
    expect(voiceStorageKeys("a", "one")).not.toEqual(
      voiceStorageKeys("b", "one"),
    );
    expect(voiceStorageKeys("a", "one")).not.toEqual(
      voiceStorageKeys("a", "two"),
    );
    expect(
      parseVoicePresets(
        JSON.stringify([
          { name: "Baseline", settings: DEFAULT_VOICE_SETTINGS },
        ]),
      ),
    ).toHaveLength(1);
    expect(() =>
      parseVoicePresets(
        JSON.stringify([
          { name: "Bad", settings: { ...DEFAULT_VOICE_SETTINGS, tools: [{}] } },
        ]),
      ),
    ).toThrow();
  });
  it("does not silently discard the beginning of the current run", () => {
    const full = {
      ...record,
      events: Array.from({ length: 200 }, () => ({
        at: record.startedAt,
        status: "accepted" as const,
      })),
    };
    expect(() =>
      appendVoiceEvent(full, { at: record.startedAt, status: "ended" }),
    ).toThrow("record is full");
  });
});
