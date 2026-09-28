import { expect, it, vi } from "vitest";
import {
  EndingCheckDeferred,
  LiveEndingObserver,
} from "./live-ending-observer";
import { ConversationEnd } from "./conversation-end";
let fragmentId = 0;
const timing = () => ({
  event_id: `fragment-${++fragmentId}`,
  start_ms: fragmentId * 10,
  end_ms: fragmentId * 10 + 10,
});
const input = (delta: string) => ({
  ...timing(),
  type: "session.input_transcript.delta",
  delta,
});
const output = (delta: string) => ({
  ...timing(),
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
  await vi.waitFor(() => expect(observer.busy).toBe(false));
  observer.tick(false, true, 2800);
  expect(closing.armed).toBe(true);
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
it("checks while canvas work is pending, rejects a non-ending, and stops after closure", async () => {
  const check = vi.fn(async () => false),
    end = vi.fn();
  const observer = new LiveEndingObserver(check, end);
  observer.receive(input("Change the color."), 0);
  observer.receive(output("I'll do that."), 100);
  observer.tick(true, true, 2000);
  await vi.waitFor(() => expect(check).toHaveBeenCalledOnce());
  observer.tick(false, true, 2100);
  await vi.waitFor(() => expect(observer.busy).toBe(false));
  expect(end).not.toHaveBeenCalled();
  observer.close();
  observer.receive(input("Goodbye"), 3000);
  observer.receive(output("Bye"), 3100);
  observer.tick(false, true, 5000);
  expect(check).toHaveBeenCalledOnce();
});

it("routes an explicit unhanded canvas request without accepting the assistant's save claim", async () => {
  const requestCanvas = vi.fn();
  const end = vi.fn();
  const observer = new LiveEndingObserver(
    async () => ({ end: false, canvasAction: true }),
    end,
    undefined,
    requestCanvas,
  );
  observer.receive(input("Create a new document with this transcript."), 0);
  observer.receive(output("Saved. The transcript is on the canvas."), 100);
  observer.tick(false, true, 2000);
  await vi.waitFor(() => expect(requestCanvas).toHaveBeenCalledOnce());
  expect(requestCanvas.mock.calls[0][0]).toMatchObject({
    userVersion: 1,
  });
  expect(requestCanvas.mock.calls[0][0].context).toContain(
    "Create a new document with this transcript.",
  );
  expect(end).not.toHaveBeenCalled();
  observer.tick(false, true, 2300);
  expect(requestCanvas).toHaveBeenCalledOnce();
});

it("discards a canvas routing decision when newer speech supersedes it", async () => {
  let resolve!: (decision: { end: boolean; canvasAction: boolean }) => void;
  const requestCanvas = vi.fn();
  const observer = new LiveEndingObserver(
    () => new Promise((r) => (resolve = r)),
    vi.fn(),
    undefined,
    requestCanvas,
  );
  observer.receive(input("Create a document."), 0);
  observer.receive(output("I'll do that."), 100);
  observer.tick(false, true, 2000);
  observer.receive(input("Actually, never mind."), 2100);
  resolve({ end: false, canvasAction: true });
  await vi.waitFor(() => expect(observer.busy).toBe(false));
  expect(requestCanvas).not.toHaveBeenCalled();
});

it("retains a confirmed farewell until pending canvas work finishes", async () => {
  const end = vi.fn();
  const check = vi.fn(async () => true);
  const observer = new LiveEndingObserver(check, end);
  observer.receive(input("See you later."), 0);
  observer.receive(output("Talk soon, Jason."), 100);
  observer.tick(true, true, 2000);
  await vi.waitFor(() => expect(observer.busy).toBe(false));
  expect(check).toHaveBeenCalledOnce();
  expect(end).not.toHaveBeenCalled();
  observer.tick(true, true, 2300);
  expect(end).not.toHaveBeenCalled();
  observer.tick(false, true, 2600);
  expect(end).toHaveBeenCalledOnce();
  observer.tick(false, true, 2900);
  expect(end).toHaveBeenCalledOnce();
});

it("invalidates a farewell approval when a new request arrives during work", async () => {
  const end = vi.fn();
  const observer = new LiveEndingObserver(async () => true, end);
  observer.receive(input("See you later."), 0);
  observer.receive(output("Talk soon."), 100);
  observer.tick(true, true, 2000);
  await vi.waitFor(() => expect(observer.busy).toBe(false));
  observer.receive(input("Wait, save the summary first."), 2100);
  observer.tick(false, false, 2200);
  expect(end).not.toHaveBeenCalled();
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
  await vi.waitFor(() => expect(observer.busy).toBe(false));
  observer.tick(false, true, 3200);
  expect(closing.awaitingOutput).toBe(false);
  expect(JSON.parse(check.mock.calls[0][0]).at(-1)).toEqual({
    speaker: "user",
    text: "Bye.",
  });
  closing.tick(false, true, 8499);
  expect(end).not.toHaveBeenCalled();
  closing.tick(false, true, 8500);
  expect(end).toHaveBeenCalledOnce();
});

it("retains a parting across extra assistant reassurance without requiring another user command", async () => {
  let resolveFirst!: (end: boolean) => void;
  const check = vi
    .fn<(text: string) => Promise<boolean>>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    )
    .mockResolvedValue(true);
  const end = vi.fn();
  const observer = new LiveEndingObserver(check, end);
  observer.receive(input("Thanks, talk later."), 0);
  observer.receive(output("Sure, talk soon."), 100);
  observer.tick(false, true, 1700);
  expect(check).toHaveBeenCalledOnce();
  observer.receive(output("I'll be here when you want to pick this up."), 1800);
  resolveFirst(true);
  await vi.waitFor(() => expect(observer.busy).toBe(false));
  expect(end).not.toHaveBeenCalled();
  observer.tick(false, true, 3400);
  await vi.waitFor(() => expect(end).toHaveBeenCalledOnce());
  expect(check).toHaveBeenCalledOnce();
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

it("retains ending intent across overlapping fragments, whitespace and delayed delivery", async () => {
  const end = vi.fn();
  const check = vi.fn(async (text: string) => {
    const turns = JSON.parse(text) as { speaker: string; text: string }[];
    // Verify the evidence supplied to the semantic evaluator, rather than
    // assuming it receives the complete sentence from a real stream.
    expect(turns[0]).toEqual({
      speaker: "user",
      text: "Great. We can end it here.",
    });
    expect(turns.at(-1)).toEqual({ speaker: "user", text: "Bye" });
    expect(turns.map((p) => p.text).join("")).toContain("Talk with you later.");
    return true;
  });
  const observer = new LiveEndingObserver(check, end);
  const events = [input("Great."), input(" "), input("We can end it here.")];
  // The live provider can deliver overlapping transcript fragments separately.
  for (let i = 0; i < 6; i++) {
    events.push(
      output(i === 0 ? "No problem." : "."),
      input(i === 0 ? "Thank" : "."),
    );
  }
  events.push(output("Talk with you later."), input("Bye"));
  // Arrival order is not transcript time order. Duplicate delivery is harmless.
  for (const event of [...events].reverse()) observer.receive(event, 1000);
  observer.receive(events.at(-1)!, 1000);
  observer.tick(false, true, 3000);
  await vi.waitFor(() => expect(observer.busy).toBe(false));
  observer.tick(false, true, 3300);
  expect(end).toHaveBeenCalledOnce();
  expect(check).toHaveBeenCalledOnce();
});

it("keeps an approved goodbye through assistant task completion speech", async () => {
  const end = vi.fn();
  const check = vi.fn(async () => true);
  const observer = new LiveEndingObserver(check, end);
  observer.receive(input("That's all, talk later."), 0);
  observer.receive(output("Talk soon."), 100);
  observer.tick(true, true, 2000);
  await vi.waitFor(() => expect(observer.busy).toBe(false));
  observer.receive(output("The document is saved too."), 2200);
  observer.tick(false, false, 2300);
  expect(end).not.toHaveBeenCalled();
  observer.tick(false, true, 3900);
  expect(end).toHaveBeenCalledOnce();
  expect(check).toHaveBeenCalledOnce();
});

it("uses current work state when a delayed ending check finishes", async () => {
  let resolve!: (end: boolean) => void;
  const end = vi.fn();
  const observer = new LiveEndingObserver(
    () =>
      new Promise<boolean>((r) => {
        resolve = r;
      }),
    end,
  );
  observer.receive(input("Talk later."), 0);
  observer.receive(output("Bye."), 100);
  observer.tick(false, true, 2000);
  observer.tick(true, true, 2100);
  resolve(true);
  await vi.waitFor(() => expect(observer.busy).toBe(false));
  expect(end).not.toHaveBeenCalled();
  observer.tick(true, true, 2300);
  expect(end).not.toHaveBeenCalled();
  observer.tick(false, true, 2500);
  expect(end).toHaveBeenCalledOnce();
});

it("retries a deferred check after pending work clears without new speech", async () => {
  const end = vi.fn();
  const check = vi
    .fn()
    .mockRejectedValueOnce(new EndingCheckDeferred())
    .mockResolvedValue(true);
  const observer = new LiveEndingObserver(check, end);
  observer.receive(input("See you later."), 0);
  observer.receive(output("Bye for now."), 100);
  observer.tick(true, true, 2000);
  await vi.waitFor(() => expect(observer.busy).toBe(false));
  observer.tick(true, true, 5000);
  expect(check).toHaveBeenCalledOnce();
  observer.tick(false, true, 5100);
  await vi.waitFor(() => expect(observer.busy).toBe(false));
  expect(check).toHaveBeenCalledTimes(2);
  observer.tick(false, true, 5400);
  expect(end).toHaveBeenCalledOnce();
});

it("backs off deferred checks and stops retrying after closure", async () => {
  const check = vi.fn().mockRejectedValue(new EndingCheckDeferred());
  const observer = new LiveEndingObserver(check, vi.fn());
  observer.receive(input("Bye."), 0);
  observer.receive(output("Bye."), 100);
  observer.tick(false, true, 2000);
  await vi.waitFor(() => expect(observer.busy).toBe(false));
  observer.tick(false, true, 3999);
  expect(check).toHaveBeenCalledOnce();
  observer.tick(false, true, 4000);
  await vi.waitFor(() => expect(observer.busy).toBe(false));
  expect(check).toHaveBeenCalledTimes(2);
  observer.close();
  observer.tick(false, true, 9000);
  expect(check).toHaveBeenCalledTimes(2);
});

it("can reassess an ending after the participant resumes during the hang-up grace", async () => {
  const end = vi.fn();
  const check = vi
    .fn()
    .mockResolvedValueOnce(true)
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(true);
  const observer = new LiveEndingObserver(check, end);
  observer.receive(input("Bye."), 0);
  observer.receive(output("Bye."), 100);
  observer.tick(false, true, 2000);
  await vi.waitFor(() => expect(observer.busy).toBe(false));
  observer.tick(false, true, 2300);
  expect(end).toHaveBeenCalledOnce();
  observer.receive(input("Wait, one more question."), 2400);
  observer.receive(output("Go ahead."), 2500);
  observer.tick(false, true, 4200);
  await vi.waitFor(() => expect(observer.busy).toBe(false));
  observer.tick(false, true, 4500);
  expect(end).toHaveBeenCalledOnce();
  observer.receive(input("That's all, bye."), 4600);
  observer.receive(output("Take care."), 4700);
  observer.tick(false, true, 6400);
  await vi.waitFor(() => expect(observer.busy).toBe(false));
  observer.tick(false, true, 6700);
  expect(end).toHaveBeenCalledTimes(2);
});

it("confirms a completed farewell even while the assistant adds unwanted speech", async () => {
  const end = vi.fn(),
    approved = vi.fn(),
    check = vi.fn(async () => true);
  const observer = new LiveEndingObserver(
    check,
    end,
    undefined,
    undefined,
    approved,
  );
  observer.receive(input("Stop reading now, I'm done for today."), 0);
  observer.receive(output("No problem, see you later."), 500);
  observer.receive(output("And another thing about that document..."), 1800);
  observer.tick(false, false, 2000, true);
  await vi.waitFor(() => expect(observer.busy).toBe(false));
  expect(approved).toHaveBeenCalledOnce();
  expect(end).not.toHaveBeenCalled();
  observer.tick(false, true, 4000, true);
  expect(end).toHaveBeenCalledOnce();
});

it("does not check over continuing participant speech or repeatedly over assistant chunks", async () => {
  const check = vi.fn(async () => false);
  const observer = new LiveEndingObserver(check, vi.fn());
  observer.receive(input("One more thing"), 0);
  observer.receive(output("Go ahead"), 100);
  observer.tick(false, false, 2000, false);
  expect(check).not.toHaveBeenCalled();
  observer.tick(false, false, 2100, true);
  await vi.waitFor(() => expect(observer.busy).toBe(false));
  expect(check).toHaveBeenCalledOnce();
  observer.receive(output("about that document"), 2300);
  observer.tick(false, false, 4000, true);
  expect(check).toHaveBeenCalledOnce();
});

it("retries ending before a queued report is spoken once backend work releases its reservation", async () => {
  const approved = vi.fn(),
    end = vi.fn();
  const check = vi
    .fn()
    .mockRejectedValueOnce(new EndingCheckDeferred())
    .mockResolvedValue(true);
  const observer = new LiveEndingObserver(
    check,
    end,
    undefined,
    undefined,
    approved,
  );
  observer.receive(input("I'm done. Talk later."), 0);
  observer.receive(output("See you later."), 100);
  observer.tick(true, true, 2000, true, true);
  await vi.waitFor(() => expect(observer.busy).toBe(false));
  expect(observer.awaitingReview).toBe(true);
  observer.tick(true, true, 4100, true, false); // Report is queued; executor has finished.
  await vi.waitFor(() => expect(observer.busy).toBe(false));
  expect(approved).toHaveBeenCalledOnce();
  expect(observer.awaitingReview).toBe(false);
  expect(end).not.toHaveBeenCalled();
  observer.tick(false, true, 4400, true, false);
  expect(end).toHaveBeenCalledOnce();
});
