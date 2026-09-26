import { expect, it, vi } from "vitest";
import { liveAudioActivity } from "./live-audio-activity";
import { ConversationEnd } from "./conversation-end";

it("reads the SDK output delta field and ignores silent PCM during the closing gap", () => {
  const end = vi.fn();
  const closing = new ConversationEnd(end);
  const pcm = Buffer.alloc(960);
  for (let i = 0; i < pcm.length; i += 2) pcm.writeInt16LE(4000, i);
  const speech = {
    type: "session.output_audio.delta",
    delta: pcm.toString("base64"),
  };
  expect(liveAudioActivity(speech)).toBe(true);
  if (liveAudioActivity(speech)) closing.output(1000);
  closing.request(1500);
  for (let now = 1600; now <= 3600; now += 100) {
    const silent = {
      type: "session.output_audio.delta",
      delta: Buffer.alloc(960).toString("base64"),
    };
    if (liveAudioActivity(silent)) closing.output(now);
    closing.tick(false, true, now);
  }
  expect(end).toHaveBeenCalledOnce();
  expect(
    liveAudioActivity({
      type: "session.input_audio.append",
      audio: pcm.toString("base64"),
    }),
  ).toBe(true);
  expect(liveAudioActivity({ type: "session.output_audio.delta" })).toBe(false);
});
