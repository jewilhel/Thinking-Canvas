import { expect, it } from "vitest";
import { LiveClosingSpeech } from "./live-closing-speech";

it("sends one stay-silent instruction and turns late reports into quiet context", () => {
  const speech = new LiveClosingSpeech();
  expect(speech.confirm()).toContain("Stop speaking now");
  expect(speech.confirm()).toBeUndefined();
  expect(
    speech.update("session.commentary.append", "Document contents"),
  ).toMatchObject({
    type: "session.thinking.append",
    content: expect.stringContaining("Document contents"),
  });
});
it("does not let an expiry instruction request another goodbye after the farewell", () => {
  const speech = new LiveClosingSpeech();
  speech.confirm();
  const update = speech.update(
    "session.instructions.append",
    "Give a final goodbye now",
  );
  expect(update.type).toBe("session.thinking.append");
  expect(update.content).toContain("Do not say this aloud");
});
it("restores ordinary responses only when the participant resumes", () => {
  const speech = new LiveClosingSpeech();
  expect(speech.resume()).toBeUndefined();
  expect(speech.update("session.commentary.append", "Saved").type).toBe(
    "session.commentary.append",
  );
  speech.confirm();
  expect(speech.resume()).toContain("new words");
  expect(speech.resume()).toBeUndefined();
  expect(speech.update("session.commentary.append", "Saved")).toEqual({
    type: "session.commentary.append",
    content: "Saved",
  });
  expect(speech.confirm()).toContain("Stop speaking now");
});
