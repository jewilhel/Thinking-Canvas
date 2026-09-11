import { describe, expect, it } from "vitest";
import {
  buildLiveSession,
  DEFAULT_LIVE_SETTINGS,
  liveUsageUnits,
  liveUnitsToCents,
} from "./live-protocol";

describe("Live contract and accounting", () => {
  it("pins privacy, delegation, and browser permissions independently of tuning", () => {
    const session = buildLiveSession(DEFAULT_LIVE_SETTINGS);
    expect(session.store).toBe(false);
    expect(session.delegation).toEqual({ type: "client" });
    expect(session.client?.data_channel.allowed_client_events).toEqual([
      "session.input_audio.mute",
      "session.input_audio.unmute",
      "session.close",
    ]);
    expect(() =>
      buildLiveSession({ ...DEFAULT_LIVE_SETTINGS, store: true } as never),
    ).toThrow();
  });
  it("credits startup and preserves fractional cents until settlement", () => {
    expect(liveUsageUnits(0)).toBe(15000);
    expect(liveUsageUnits(15)).toBe(15000);
    expect(liveUsageUnits(60)).toBe(60000);
    expect(liveUnitsToCents(liveUsageUnits(600)!)).toBe(50);
    expect(liveUnitsToCents(liveUsageUnits(300)!)).toBe(25);
    expect(liveUnitsToCents(liveUsageUnits(3600)!)).toBe(300);
    expect(liveUsageUnits(15.001)).toBe(15001);
  });
  it("does not turn unknown or malformed usage into a refund", () => {
    for (const value of [
      undefined,
      null,
      -1,
      NaN,
      Infinity,
      "60",
      Number.MAX_VALUE,
    ])
      expect(liveUsageUnits(value)).toBeNull();
    expect(() => liveUnitsToCents(-1)).toThrow();
  });
});
