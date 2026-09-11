import { describe, expect, it, vi } from "vitest";
import { LiveDelegationOwner } from "./live-delegation-owner";
import { voiceBackendUnits } from "./live-delegation-contract";
function setup() {
  const hooks = {
    run: vi.fn(async () => "Verified canvas description"),
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
  it("waits for late fragments, deduplicates work, then returns verified output only during quiet", async () => {
    const { owner, hooks } = setup();
    owner.receive(delegated, 0);
    owner.tick(1000);
    expect(hooks.run).not.toHaveBeenCalled();
    owner.receive(speech("Describe this canvas."), 1500);
    owner.tick(2000);
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
      "Verified canvas description",
    ]);
  });
  it("never executes a fragment alone or an ambiguous/mutating request", () => {
    const { owner, hooks } = setup();
    owner.receive(speech("Delete this canvas."));
    owner.tick(5000);
    expect(hooks.run).not.toHaveBeenCalled();
    owner.receive(delegated, 0);
    owner.tick(3000);
    expect(hooks.run).not.toHaveBeenCalled();
    expect(hooks.append).toHaveBeenCalledTimes(1);
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
    owner.receive(speech("Describe this canvas."));
    owner.tick(3000);
    await owner.cancel();
    resolve("Stale result");
    await owner.close();
    owner.tick(6000);
    expect(hooks.append).not.toHaveBeenCalled();
  });
  it("requires a real delegation even after the explicit settings test request", () => {
    const { owner, hooks } = setup();
    owner.requestDescription(0);
    owner.tick(3000);
    expect(hooks.run).not.toHaveBeenCalled();
    owner.receive(delegated, 3000);
    owner.tick(5000);
    expect(hooks.run).toHaveBeenCalledTimes(1);
  });
  it("counts backend tokens in the same integer units without understating small usage", () => {
    expect(voiceBackendUnits("gpt-5.6-luna", 1000, 1000)).toBe(1680);
    expect(voiceBackendUnits("gpt-5.6-sol", 100000, 2048)).toBeLessThan(
      1200000,
    );
    expect(voiceBackendUnits("gpt-5.6-luna", -1, 0)).toBeNull();
    expect(voiceBackendUnits("gpt-5.6-luna", 1, 0)).toBe(1);
  });
});
