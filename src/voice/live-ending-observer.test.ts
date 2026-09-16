import { expect, it, vi } from "vitest";
import { LiveEndingObserver } from "./live-ending-observer";
import { ConversationEnd } from "./conversation-end";
const input = (delta: string) => ({
  type: "session.input_transcript.delta",
  delta,
});
const output = (delta: string) => ({
  type: "session.output_transcript.delta",
  delta,
});
it("closes after a natural farewell even when Voice emits no delegation", async () => {
  const end = vi.fn();
  const closing = new ConversationEnd(end);
  const check = vi.fn<(text: string) => Promise<boolean>>(async () => true);
  const observer = new LiveEndingObserver(check, () => closing.request(5000));
  observer.receive(
    input("That's the conclusion of my test. We can end there."),
    0,
  );
  observer.receive(output("Sure thing. Thanks for the chat. Take care."), 1000);
  closing.output(1000);
  observer.tick(false, true, 2000);
  expect(check).not.toHaveBeenCalled();
  observer.tick(false, true, 2600);
  await vi.waitFor(() => expect(closing.armed).toBe(true));
  closing.tick(false, true, 5100);
  expect(end).toHaveBeenCalledOnce();
  observer.tick(false, true, 6000);
  expect(check).toHaveBeenCalledOnce();
});
it("discards approval when the participant resumes during the check", async () => {
  let resolve!: (end: boolean) => void;
  const end = vi.fn();
  const check = vi.fn(
    () =>
      new Promise<boolean>((r) => {
        resolve = r;
      }),
  );
  const observer = new LiveEndingObserver(check, end);
  observer.receive(input("I'm done."), 0);
  observer.receive(output("Take care."), 100);
  observer.tick(false, true, 2000);
  observer.receive(input("Actually save the transcript first."), 2100);
  resolve(true);
  await vi.waitFor(() => expect(observer.busy).toBe(false));
  expect(end).not.toHaveBeenCalled();
});
it("waits for canvas work, rejects a non-ending, and stops after closure", async () => {
  const check = vi.fn(async () => false),
    end = vi.fn();
  const observer = new LiveEndingObserver(check, end);
  observer.receive(input("Change the color."), 0);
  observer.receive(output("I'll do that."), 100);
  observer.tick(true, true, 2000);
  expect(check).not.toHaveBeenCalled();
  observer.tick(false, true, 2100);
  await vi.waitFor(() => expect(observer.busy).toBe(false));
  expect(end).not.toHaveBeenCalled();
  observer.close();
  observer.receive(input("Goodbye"), 3000);
  observer.receive(output("Bye"), 3100);
  observer.tick(false, true, 5000);
  expect(check).toHaveBeenCalledOnce();
});

it("lets the participant have the last word after the AI farewell", async () => {
  const end = vi.fn();
  const closing = new ConversationEnd(end);
  const check = vi.fn<(text: string) => Promise<boolean>>(async () => true);
  const observer = new LiveEndingObserver(check, () =>
    closing.confirmCompletedExchange(6000),
  );
  observer.receive(input("I'm ready to end for now."), 0);
  observer.receive(output("Catch you later, Jason."), 1000);
  closing.output(1000);
  closing.request(1100);
  observer.receive(input("Bye."), 1200);
  closing.cancel(); // The supervisor immediately suspends hang-up while listening.
  closing.request(2000); // A parallel ending handoff must not require another farewell.
  expect(closing.awaitingOutput).toBe(true);
  observer.tick(false, true, 3000);
  await vi.waitFor(() => expect(check).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(closing.awaitingOutput).toBe(false));
  expect(JSON.parse(check.mock.calls[0][0]).at(-1)).toEqual({
    speaker: "user",
    text: "Bye.",
  });
  closing.tick(false, true, 8499);
  expect(end).not.toHaveBeenCalled();
  closing.tick(false, true, 8500);
  expect(end).toHaveBeenCalledOnce();
});

it("checks a final user turn but leaves the call open for a new request", async () => {
  const end = vi.fn(),
    check = vi.fn(async () => false);
  const observer = new LiveEndingObserver(check, end);
  observer.receive(input("Let's end here."), 0);
  observer.receive(output("Talk with you later."), 100);
  observer.receive(input("Wait, please save a summary first."), 200);
  observer.tick(false, true, 2000);
  await vi.waitFor(() => expect(observer.busy).toBe(false));
  expect(check).toHaveBeenCalledOnce();
  expect(end).not.toHaveBeenCalled();
});
