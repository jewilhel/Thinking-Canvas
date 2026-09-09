import { describe, expect, it } from "vitest";
import {
  buildVoiceSession,
  DEFAULT_VOICE_SETTINGS as defaults,
  effectiveVoiceSettings,
  voiceSettingsSchema,
} from "./voice-settings";

describe("voice tuning contract", () => {
  it("sends only compatible VAD fields and supports manual mode", () => {
    const semantic = buildVoiceSession(defaults).audio.input.turn_detection;
    expect(semantic).toMatchObject({ type: "semantic_vad", eagerness: "auto" });
    expect(semantic).not.toHaveProperty("threshold");
    const server = buildVoiceSession({
      ...defaults,
      detection: "server_vad",
      idleMs: 10000,
    }).audio.input.turn_detection;
    expect(server).toMatchObject({
      type: "server_vad",
      threshold: 0.5,
      idle_timeout_ms: 10000,
    });
    expect(server).not.toHaveProperty("eagerness");
    expect(
      buildVoiceSession({ ...defaults, detection: "manual" }).audio.input
        .turn_detection,
    ).toBeNull();
  });
  it("rejects invalid/unknown imported settings and server overrides", () => {
    for (const change of [
      { speed: 2 },
      { idleMs: 10 },
      { threshold: -1 },
      { tools: [{}] },
      { model: "another" },
    ]) {
      expect(
        voiceSettingsSchema.safeParse({ ...defaults, ...change }).success,
      ).toBe(false);
    }
  });
  it("does not log credentials, tool payloads, or conversation events", () => {
    const effective = effectiveVoiceSettings({
      ...buildVoiceSession(defaults),
      client_secret: { value: "secret" },
      conversation: { text: "private" },
      id: "sess-private",
      tools: [{ description: "private" }],
    });
    expect(effective).toHaveProperty("audio");
    const text = JSON.stringify(effective);
    expect(text).not.toContain("secret");
    expect(text).not.toContain("private");
    expect(effectiveVoiceSettings("bad")).toEqual({});
  });
  it("clears optional input transcription/noise reduction explicitly", () => {
    expect(
      buildVoiceSession({
        ...defaults,
        transcription: false,
        noiseReduction: "off",
      }).audio.input,
    ).toMatchObject({ transcription: null, noise_reduction: null });
  });
});
