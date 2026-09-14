import { describe, expect, it, vi } from "vitest";
import { retryVoiceCheck } from "./retry-voice-check";
describe("voice access check recovery", () => {
  it("recovers from a transient failure but returns a confirmed denial immediately", async () => {
    const check = vi
      .fn()
      .mockResolvedValueOnce({ error: true, allowed: false })
      .mockResolvedValue({ error: false, allowed: false });
    expect(
      await retryVoiceCheck(
        check,
        (r: { error: boolean; allowed: boolean }) => r.error,
      ),
    ).toEqual({
      error: false,
      allowed: false,
    });
    expect(check).toHaveBeenCalledTimes(2);
    check.mockClear();
    await retryVoiceCheck(
      check,
      (r: { error: boolean; allowed: boolean }) => r.error,
    );
    expect(check).toHaveBeenCalledOnce();
  });
  it("bounds retries when the server stays unavailable", async () => {
    const check = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(retryVoiceCheck(check, () => false)).rejects.toThrow(
      "offline",
    );
    expect(check).toHaveBeenCalledTimes(3);
  });
});
