import { describe, expect, it, vi } from "vitest";
import { LiveDelegationOwner, splitLiveReport } from "./live-delegation-owner";
import {
  voiceBackendUnits,
  controlRequestIsCurrent,
} from "./live-delegation-contract";
function setup() {
  const hooks = {
    run: vi.fn<
      (
        id: string,
        signal: AbortSignal,
        request: import("./live-delegation-contract").LiveCanvasRequest,
      ) => Promise<import("./live-delegation-contract").LiveCanvasResult>
    >(async () => "Verified canvas description"),
    append: vi.fn(),
    cancel: vi.fn(async () => {}),
    quiet: vi.fn(() => true),
  };
  return { hooks, owner: new LiveDelegationOwner(hooks) };
}
const delegated = {
  type: "session.delegation.created",
  offset_ms: 5000,
  delegation: { id: "task1", type: "delegation", target: "client" },
};
const speech = (delta: string, event_id = "speech1", start_ms = 4000) => ({
  type: "session.input_transcript.delta",
  event_id,
  delta,
  start_ms,
  end_ms: start_ms + 500,
});
describe("bounded voice delegation", () => {
  it("passes the prior session separately without interpreting old requests as current commands", () => {
    const { hooks } = setup();
    const previousConversation = {
      id: "11111111-1111-4111-8111-111111111111",
      startedAt: "2026-09-14T12:00:00.000Z",
      text: "You: Create an idea document",
      gaps: [],
    };
    const owner = new LiveDelegationOwner({ ...hooks, previousConversation });
    owner.receive(speech("Save the previous conversation as a transcript"), 0);
    owner.receive(delegated, 0);
    owner.tick(2000);
    const context = JSON.parse(hooks.run.mock.calls[0][2].text);
    expect(context.previousSessionTranscript).toEqual(previousConversation);
    expect(context.sessionTranscript.text).not.toContain(
      "Create an idea document",
    );
    expect(context.fragments).toHaveLength(1);
  });
  it("includes both speakers for a short confirmation without phrase matching", () => {
    const { owner, hooks } = setup();
    owner.receive(
      speech(
        "Well, can you, um, tell me what kinds of shapes are on this canvas",
        "s1",
        0,
      ),
      0,
    );
    owner.receive(
      {
        ...speech("Do you mean this canvas?", "a1", 2000),
        type: "session.output_transcript.delta",
      },
      0,
    );
    owner.receive(speech("Yes", "s2", 4000), 0);
    owner.receive(delegated, 0);
    owner.tick(2000);
    const context = JSON.parse(hooks.run.mock.calls[0][2].text);
    expect(
      context.fragments.map((x: { speaker: string }) => x.speaker),
    ).toEqual(["user", "assistant", "user"]);
    expect(context.fragments.at(-1).text).toBe("Yes");
  });
  it("does not discard a new natural request merely because it contains actually or instead", () => {
    const { owner, hooks } = setup();
    owner.receive(speech("Actually, can you describe the shapes instead?"), 0);
    owner.receive(delegated, 0);
    owner.tick(2000);
    expect(hooks.run).toHaveBeenCalledOnce();
    expect(hooks.cancel).not.toHaveBeenCalled();
  });
  it("waits for late wording and includes speech beyond the old fixed timeline window", () => {
    const { owner, hooks } = setup();
    owner.receive(
      speech("[tongue click] Leave a comment on Jason", "s1", 4000),
      0,
    );
    owner.receive(delegated, 0);
    owner.receive(speech(" saying voice comment test", "s2", 18000), 1900);
    owner.tick(2200);
    expect(hooks.run).not.toHaveBeenCalled();
    owner.tick(3500);
    expect(
      JSON.parse(hooks.run.mock.calls[0][2].text).fragments.at(-1).text,
    ).toBe(" saying voice comment test");
  });
  it("keeps a handoff received while busy and includes the previous completed outcome", async () => {
    const { owner, hooks } = setup();
    owner.receive(speech("Leave a comment on Jason saying test."), 0);
    owner.receive(delegated, 0);
    owner.tick(2000);
    await vi.waitFor(() => expect(owner.busy).toBe(true));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    owner.receive(
      speech("Did that comment get added?", "followup", 20000),
      3000,
    );
    owner.receive(
      {
        ...delegated,
        offset_ms: 21000,
        delegation: { ...delegated.delegation, id: "task2" },
      },
      3000,
    );
    // Deliver the first report before starting the queued follow-up.
    for (let i = 0; i < 5; i++) {
      owner.tick(6000);
      await Promise.resolve();
    }
    expect(hooks.run).toHaveBeenCalledTimes(2);
    expect(JSON.parse(hooks.run.mock.calls[1][2].text).completedTasks).toEqual([
      { id: "task1", text: "Verified canvas description" },
    ]);
  });
  it.each([
    "Okay",
    "Yes, go ahead",
    "Are you still working?",
    "Thanks",
    "No problem",
    "Actually, thanks",
  ])(
    "keeps pending canvas work alive during conversational speech: %s",
    (text) => {
      const { owner, hooks } = setup();
      hooks.run.mockImplementation(() => new Promise(() => {}));
      owner.receive(speech("Tell me what is on the canvas."), 0);
      owner.receive(delegated, 0);
      owner.tick(2000);
      owner.receive(speech(text, "followup", 10000), 2500);
      expect(hooks.run.mock.calls[0][1].aborted).toBe(false);
      expect(hooks.cancel).not.toHaveBeenCalled();
    },
  );
  it("aborts pending execution when later speech changes its context", async () => {
    const { owner, hooks } = setup();
    hooks.run.mockImplementation(() => new Promise(() => {}));
    owner.receive(speech("Leave a comment on Jason saying test."), 0);
    owner.receive(delegated, 0);
    owner.tick(2000);
    owner.receive(speech("No, use Scotty", "correction", 10000), 2500);
    expect(hooks.run.mock.calls[0][1].aborted).toBe(true);
    expect(hooks.cancel).toHaveBeenCalledOnce();
  });
  it.each([
    {
      kind: "question",
      parts: [
        " Yeah.",
        " Can you tell me",
        " what kinds of shapes are on this canvas",
      ],
    },
    {
      kind: "comment",
      parts: [
        " How about,",
        " can you leave a comment on on the object JSON",
        " that says 'voice comment test",
      ],
    },
  ])(
    "routes conversational $kind speech through provider delegation",
    ({ parts }) => {
      const { owner, hooks } = setup();
      owner.receive(delegated, 0);
      parts.forEach((part, index) =>
        owner.receive(speech(part, `fragment${index}`, 3500 + index * 500), 0),
      );
      owner.tick(2000);
      expect(hooks.run).toHaveBeenCalledOnce();
      const request = hooks.run.mock.calls[0][2];
      expect(request.kind).toBe("conversation");
      expect(
        JSON.parse(request.text)
          .fragments.map((x: { text: string }) => x.text)
          .join(""),
      ).toBe(parts.join(""));
    },
  );
  it("routes the actual comment request and does not reuse its speech in a later delegation", async () => {
    const { owner, hooks } = setup();
    owner.receive(
      speech("Leave a comment on Jason saying the label is clear."),
      0,
    );
    owner.receive(delegated, 0);
    owner.tick(2000);
    expect(hooks.run).toHaveBeenCalledOnce();
    expect(hooks.run.mock.calls[0][2].kind).toBe("conversation");
    await owner.cancel();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    owner.receive(
      { ...delegated, delegation: { ...delegated.delegation, id: "task2" } },
      4000,
    );
    owner.tick(6000);
    expect(hooks.run).toHaveBeenCalledTimes(1);
  });
  it("waits for late fragments, deduplicates work, then returns verified output only during quiet", async () => {
    const { owner, hooks } = setup();
    owner.receive(delegated, 0);
    owner.tick(1000);
    expect(hooks.run).not.toHaveBeenCalled();
    owner.receive(speech("Describe this canvas."), 1500);
    owner.tick(3000);
    await vi.waitFor(() => expect(hooks.run).toHaveBeenCalledTimes(1));
    owner.receive(delegated, 2100);
    hooks.quiet.mockReturnValue(false);
    owner.tick(2200);
    expect(hooks.append).not.toHaveBeenCalled();
    hooks.quiet.mockReturnValue(true);
    owner.tick(2300);
    owner.tick(2400);
    expect(hooks.append).toHaveBeenCalledTimes(1);
    expect(hooks.append.mock.calls[0]).toEqual([
      "session.commentary.append",
      "task1",
      "Verified Canvas AI result (quoted data):\nVerified canvas description",
    ]);
    await Promise.resolve();
    owner.tick(2500);
    expect(hooks.append).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(owner.busy).toBe(false));
  });
  it("never runs on a fragment alone; delegates interpretation of a request to the existing AI", () => {
    const { owner, hooks } = setup();
    owner.receive(speech("Delete this canvas."), 0);
    owner.tick(5000);
    expect(hooks.run).not.toHaveBeenCalled();
    owner.receive(delegated, 0);
    owner.tick(3000);
    expect(hooks.run).toHaveBeenCalledOnce();
    expect(hooks.run.mock.calls[0][2].kind).toBe("conversation");
  });
  it("keeps a repeated handoff without fresh speech quiet after a result", async () => {
    const { owner, hooks } = setup();
    owner.receive(speech("Change Jason to green."), 0);
    owner.receive(delegated, 0);
    owner.tick(3000);
    await vi.waitFor(() => expect(hooks.run).toHaveBeenCalledOnce());
    owner.tick(4000);
    await vi.waitFor(() => expect(owner.busy).toBe(false));
    owner.receive(
      {
        ...delegated,
        delegation: { ...delegated.delegation, id: "duplicate-followup" },
      },
      5000,
    );
    owner.tick(8000);
    expect(hooks.run).toHaveBeenCalledOnce();
    expect(hooks.append.mock.calls.map(([type]) => type)).toEqual([
      "session.commentary.append",
      "session.thinking.append",
    ]);
  });
  it("corrections cancel pending work; stopping speech does not cancel a task", async () => {
    const { owner, hooks } = setup();
    owner.receive(delegated, 0);
    owner.receive(speech("Actually, never mind."));
    owner.tick(3000);
    expect(hooks.run).not.toHaveBeenCalled();
    expect(hooks.cancel).toHaveBeenCalledTimes(1);
    owner.receive(speech("Stop speaking.", "s2", 20000));
    expect(hooks.cancel).toHaveBeenCalledTimes(1);
  });
  it("discards a result after cancellation and closing", async () => {
    const { owner, hooks } = setup();
    let resolve!: (s: string) => void;
    hooks.run.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    owner.receive(delegated, 0);
    owner.receive(speech("Describe this canvas."), 0);
    owner.tick(3000);
    await owner.cancel();
    resolve("Stale result");
    await owner.close();
    owner.tick(6000);
    expect(hooks.append).not.toHaveBeenCalled();
  });
  it("runs an authenticated application request once without inventing a provider delegation ID", async () => {
    const { owner, hooks } = setup();
    owner.requestDescription("control:request1");
    owner.requestDescription("control:request1");
    await vi.waitFor(() => expect(owner.busy).toBe(true));
    await Promise.resolve();
    await Promise.resolve();
    owner.tick(5000);
    expect(hooks.run).toHaveBeenCalledTimes(1);
    expect(hooks.append).toHaveBeenCalledWith(
      "session.commentary.append",
      null,
      "Verified Canvas AI result (quoted data):\nVerified canvas description",
    );
  });

  it("counts backend tokens in the same integer units without understating small usage", () => {
    expect(voiceBackendUnits("gpt-5.6-luna", 1000, 1000)).toBe(1680);
    expect(voiceBackendUnits("gpt-5.6-sol", 200000, 4096)).toBeLessThan(
      1200000,
    );
    expect(voiceBackendUnits("gpt-5.6-luna", -1, 0)).toBeNull();
    expect(voiceBackendUnits("gpt-5.6-luna", 1, 0)).toBe(1);
  });
});

it("preserves long Unicode reports and waits for context acknowledgments before requesting speech", async () => {
  const text =
    "Pink ellipse — Jason. 蓝色椭圆 Ica. 🟦 Scotty overlaps Ica. ".repeat(35);
  const parts = splitLiveReport(text);
  expect(parts.join("")).toBe(text);
  expect(
    parts.every((part) => new TextEncoder().encode(part).length <= 400),
  ).toBe(true);
  const { owner, hooks } = setup();
  hooks.run.mockResolvedValue(text);
  let acknowledge!: () => void;
  hooks.append.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        acknowledge = resolve;
      }),
  );
  owner.requestDescription("control:long-report");
  await vi.waitFor(() => expect(hooks.run).toHaveBeenCalledOnce());
  await Promise.resolve();
  for (let index = 0; index < parts.length; index++) {
    owner.tick();
    owner.tick();
    expect(hooks.append).toHaveBeenCalledTimes(index + 1);
    const [type, id, content] = hooks.append.mock.calls[index];
    expect(type).toBe("session.thinking.append");
    expect(id).toBeNull();
    expect(content).toBe(
      `Canvas AI report part ${index + 1}/${parts.length} (quoted data):\n${parts[index]}`,
    );
    expect(new TextEncoder().encode(content).length).toBeLessThan(500);
    acknowledge();
    await Promise.resolve();
  }
  owner.tick();
  expect(hooks.append.mock.calls.at(-1)?.[0]).toBe("session.commentary.append");
  acknowledge();
  await Promise.resolve();
  expect(owner.busy).toBe(false);
});

it("does not request a reading if cancelled while report context is being delivered", async () => {
  const { owner, hooks } = setup();
  hooks.run.mockResolvedValue("Verified report detail. ".repeat(40));
  let acknowledge!: () => void;
  hooks.append.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        acknowledge = resolve;
      }),
  );
  owner.requestDescription("control:cancel-report");
  await vi.waitFor(() => expect(hooks.run).toHaveBeenCalledOnce());
  await Promise.resolve();
  owner.tick();
  await owner.cancel();
  acknowledge();
  await Promise.resolve();
  owner.tick();
  expect(hooks.append).toHaveBeenCalledTimes(1);
  expect(owner.busy).toBe(false);
});

it("a cancellation that arrives before the next heartbeat suppresses the queued application request", () => {
  expect(
    controlRequestIsCurrent("2026-09-11T21:00:00Z", "2026-09-11T21:00:01Z"),
  ).toBe(false);
  expect(
    controlRequestIsCurrent("2026-09-11T21:00:01Z", "2026-09-11T21:00:01Z"),
  ).toBe(false);
  expect(
    controlRequestIsCurrent("2026-09-11T21:00:02Z", "2026-09-11T21:00:01Z"),
  ).toBe(true);
});

it("asks clarification and carries the original request through a short answer", async () => {
  const { owner, hooks } = setup();
  hooks.run.mockResolvedValueOnce({
    text: "Which one?",
    clarificationQuestion: "Do you mean Scotty's shape or its text?",
  });
  owner.receive(speech("Make Scotty green."), 0);
  owner.receive(delegated, 0);
  owner.tick(2000);
  await vi.waitFor(() => expect(hooks.run).toHaveResolved());
  owner.tick(2200);
  await vi.waitFor(() => expect(hooks.append).toHaveBeenCalled());
  expect(hooks.append.mock.calls.at(-1)?.[2]).toContain("needs clarification");
  expect(hooks.append.mock.calls.at(-1)?.[2]).toContain(
    "Scotty's shape or its text?",
  );
  owner.receive(speech("The shape.", "answer", 7000), 3000);
  owner.receive(
    {
      ...delegated,
      offset_ms: 8000,
      delegation: { ...delegated.delegation, id: "answer-task" },
    },
    3000,
  );
  owner.tick(5500);
  await vi.waitFor(() => expect(hooks.run).toHaveBeenCalledTimes(2));
  const context = JSON.parse(hooks.run.mock.calls[1][2].text);
  expect(context.pendingClarification.request).toEqual([
    { speaker: "user", text: "Make Scotty green." },
  ]);
  expect(context.fragments.at(-1).text).toBe("The shape.");
  expect(context.completedTasks).toEqual([]);
});

it("clears a pending clarification when the participant cancels", async () => {
  const { owner, hooks } = setup();
  hooks.run.mockResolvedValueOnce({
    text: "Which?",
    clarificationQuestion: "Which shape?",
  });
  owner.receive(speech("Change that."), 0);
  owner.receive(delegated, 0);
  owner.tick(2000);
  await vi.waitFor(() => expect(hooks.run).toHaveResolved());
  await owner.cancel();
  owner.receive(speech("Describe the canvas.", "new", 7000), 3000);
  owner.receive(
    {
      ...delegated,
      offset_ms: 8000,
      delegation: { ...delegated.delegation, id: "new-task" },
    },
    3000,
  );
  owner.tick(5500);
  await vi.waitFor(() => expect(hooks.run).toHaveBeenCalledTimes(2));
  expect(
    JSON.parse(hooks.run.mock.calls[1][2].text).pendingClarification,
  ).toBeUndefined();
});

it("does not present a technical failure as a clarification", async () => {
  const { owner, hooks } = setup();
  hooks.run.mockRejectedValueOnce(new Error("Database unavailable"));
  owner.receive(speech("Create a shape."), 0);
  owner.receive(delegated, 0);
  owner.tick(2000);
  await vi.waitFor(() => {
    owner.tick(2200);
    expect(hooks.append).toHaveBeenCalled();
  });
  expect(hooks.append.mock.calls.at(-1)?.[2]).toContain(
    "did not finish successfully",
  );
  expect(hooks.append.mock.calls.at(-1)?.[2]).not.toContain(
    "needs clarification",
  );
});

it("keeps the beginning of a long session independently of the recent command window", () => {
  const { owner, hooks } = setup();
  for (let i = 0; i < 3000; i++)
    owner.receive(
      speech(
        i === 0 ? "Our app serves rural clinics. " : `word${i} `,
        `long-${i}`,
        i * 100,
      ),
      0,
    );
  owner.receive(speech("Save the full transcript.", "save", 300500), 0);
  owner.receive({ ...delegated, offset_ms: 301000 }, 0);
  owner.tick(2500);
  expect(hooks.run).toHaveBeenCalledOnce();
  const context = JSON.parse(hooks.run.mock.calls[0][2].text);
  expect(context.fragments).toHaveLength(100);
  expect(context.sessionTranscript.text).toContain(
    "Our app serves rural clinics.",
  );
  expect(context.sessionTranscript.text).toContain("word2999");
  expect(context.sessionTranscript.text).toContain("Save the full transcript.");
  expect(context.sessionTranscript.gaps.join(" ")).not.toContain("exceeded");
});

it("arms an ending only after confirmed report delivery and cancels stale intent", async () => {
  for (const resumed of [false, true]) {
    const { hooks } = setup();
    const endSession = vi.fn();
    const owner = new LiveDelegationOwner({ ...hooks, endSession });
    hooks.run.mockResolvedValue({
      text: "Transcript saved.",
      endSession: true,
      reportBeforeEnding: true,
    });
    owner.receive(speech("Save our transcript and let's call it a day"), 0);
    owner.receive(delegated, 0);
    owner.tick(2000);
    await vi.waitFor(() => expect(owner.busy).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (resumed)
      owner.receive(speech("Actually I have another idea", "s2", 6000), 2500);
    expect(endSession).not.toHaveBeenCalled();
    owner.tick(4000);
    if (!resumed) {
      await vi.waitFor(() => expect(hooks.append).toHaveBeenCalled());
      expect(hooks.append.mock.calls.at(-1)?.[2]).toContain(
        "one short final goodbye",
      );
    } else {
      expect(hooks.append).not.toHaveBeenCalled();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(endSession).toHaveBeenCalledTimes(resumed ? 0 : 1);
  }
});

it.each([true, false])(
  "reassesses speech after a goodbye without requiring another provider delegation (end=%s)",
  async (stillEnding) => {
    const { hooks } = setup();
    const endSession = vi.fn();
    const owner = new LiveDelegationOwner({ ...hooks, endSession });
    hooks.run.mockResolvedValueOnce({
      text: "Goodbye, Jason.",
      endSession: true,
    });
    owner.receive(speech("We can end here."), 0);
    owner.receive(delegated, 0);
    owner.tick(2000);
    await new Promise((resolve) => setTimeout(resolve, 0));
    owner.tick(2200);
    await vi.waitFor(() => expect(endSession).toHaveBeenCalledOnce());
    hooks.run.mockResolvedValueOnce(
      stillEnding
        ? { text: "Take care.", endSession: true }
        : "Let's keep discussing your idea.",
    );
    owner.receive(
      speech(
        stillEnding ? "Okay" : "Actually, I have another question",
        "final-reply",
        8000,
      ),
      3000,
    );
    owner.receive(speech(".", "punctuation", 8500), 3100);
    owner.tick(4500);
    expect(hooks.run).toHaveBeenCalledOnce();
    owner.tick(5200);
    await vi.waitFor(() => expect(hooks.run).toHaveBeenCalledTimes(2));
    const context = JSON.parse(hooks.run.mock.calls[1][2].text);
    expect(context.pendingSessionEnding).toBe(true);
    expect(context.fragments.at(-2).text).toBe(
      stillEnding ? "Okay" : "Actually, I have another question",
    );
    expect(context.completedTasks[0].text).toBe("Goodbye, Jason.");
    await new Promise((resolve) => setTimeout(resolve, 0));
    owner.tick(5400);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(endSession).toHaveBeenCalledTimes(stillEnding ? 2 : 1);
    expect(hooks.append.mock.calls.at(-1)?.[1]).toBeNull();
    if (stillEnding)
      expect(hooks.append.mock.calls.at(-1)?.[0]).toBe(
        "session.thinking.append",
      );
  },
);

it.each([true, false])(
  "reviews a request arriving during document creation without another handoff (ending=%s)",
  async (ending) => {
    const { hooks } = setup();
    const endSession = vi.fn();
    const owner = new LiveDelegationOwner({ ...hooks, endSession });
    let resolveDocument!: (text: string) => void;
    hooks.run.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveDocument = resolve;
        }),
    );
    hooks.run.mockResolvedValueOnce(
      ending
        ? {
            text: "Document saved. Talk later.",
            endSession: true,
            reportBeforeEnding: true,
          }
        : "The document is saved. Let's discuss your next idea.",
    );
    owner.receive(
      speech("Create a document with our discussion.", "document", 0),
      0,
    );
    owner.receive(delegated, 0);
    owner.tick(2000);
    const latest = ending
      ? "I'm ready to stop talking for now."
      : "When that is saved, let's discuss another idea.";
    owner.receive(speech(latest, "later", 6000), 3000);
    resolveDocument("Created the discussion document successfully.");
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 6; i++) {
      owner.tick(6000 + i * 250);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(hooks.run).toHaveBeenCalledTimes(2);
    const review = JSON.parse(hooks.run.mock.calls[1][2].text);
    expect(review.fragments.at(-1).text).toBe(latest);
    expect(review.previouslyHandledThroughMs).toBe(500);
    expect(review.completedTasks).toEqual([
      { id: "task1", text: "Created the discussion document successfully." },
    ]);
    expect(hooks.append.mock.calls[0][0]).toBe("session.thinking.append");
    expect(hooks.append.mock.calls[0][2]).toContain("context only");
    expect(endSession).toHaveBeenCalledTimes(ending ? 1 : 0);
    if (ending) expect(endSession).toHaveBeenCalledWith(true);
  },
);
