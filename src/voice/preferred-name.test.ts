import { describe, expect, it } from "vitest";
import { validateVoiceName, voiceIdentityInstructions } from "./preferred-name";
import { buildLiveSession, DEFAULT_LIVE_SETTINGS } from "./live-protocol";
const context = (speaker: string, text: string, handled = -1) =>
  JSON.stringify({
    previouslyHandledThroughMs: handled,
    fragments: [{ speaker, text, endMs: 100 }],
  });
const preference = {
  action: "remember",
  name: "Jason",
  userQuote: "My name is Jason",
};
describe("private voice name", () => {
  it("accepts a current self-introduction but rejects invented, assistant or historical evidence", () => {
    expect(
      validateVoiceName(preference, context("user", "My name is Jason")),
    ).toEqual(preference);
    for (const source of [
      context("assistant", "My name is Jason"),
      context("user", "My name is Jason", 101),
      context("user", "Hello"),
    ])
      expect(() => validateVoiceName(preference, source)).toThrow();
    expect(() =>
      validateVoiceName(
        { ...preference, name: "John" },
        context("user", "My name is Jason"),
      ),
    ).toThrow();
  });
  it("supports explicitly forgetting without requiring the name again", () => {
    expect(
      validateVoiceName(
        { action: "forget", name: "", userQuote: "Forget my name" },
        context("user", "Forget my name"),
      ).action,
    ).toBe("forget");
  });
  it("greets neutrally without confirmed memory and injects only the account's supplied preference", () => {
    expect(buildLiveSession(DEFAULT_LIVE_SETTINGS).instructions).toContain(
      "No confirmed name is available",
    );
    expect(
      buildLiveSession(DEFAULT_LIVE_SETTINGS, "Jason").instructions,
    ).toContain('confirmed preferred first name is "Jason"');
    expect(voiceIdentityInstructions("Jason")).toContain("Never invent");
  });
});
