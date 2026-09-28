import { expect, it, vi } from "vitest";
import { endVoiceCall } from "./end-voice-call";

it("confirms successful hangup and calls that have already disappeared", async () => {
  const hangup = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce({ status: 404 });
  const provider = { realtime: { calls: { hangup } } };
  expect(await endVoiceCall(provider, "rtc_test")).toBe(true);
  expect(await endVoiceCall(provider, "rtc_test")).toBe(true);
});

it.each([401, 429, 500, undefined])(
  "keeps uncertain reservations for status %s",
  async (status) => {
    const hangup = vi.fn().mockRejectedValue({ status });
    expect(
      await endVoiceCall({ realtime: { calls: { hangup } } }, "rtc_test"),
    ).toBe(false);
  },
);
