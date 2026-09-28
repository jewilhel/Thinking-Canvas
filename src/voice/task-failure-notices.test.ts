import { expect, it, vi } from "vitest";
import {
  receiveVoiceTaskFailure,
  subscribeVoiceTaskFailures,
} from "./task-failure-notices";
it("rejects content-bearing and malformed metadata and removes listeners", () => {
  const listener = vi.fn();
  const unsubscribe = subscribeVoiceTaskFailures(listener);
  const notice = {
    sessionId: crypto.randomUUID(),
    id: "request",
    reason: "context_limit",
  };
  receiveVoiceTaskFailure("canvas", {
    ...notice,
    transcript: "private wording",
  });
  receiveVoiceTaskFailure("canvas", { ...notice, sessionId: "invalid" });
  receiveVoiceTaskFailure("canvas", {
    ...notice,
    reason: "provider error text",
  });
  expect(listener).not.toHaveBeenCalled();
  receiveVoiceTaskFailure("canvas", notice);
  expect(listener).toHaveBeenCalledWith("canvas", notice);
  unsubscribe();
  receiveVoiceTaskFailure("canvas", notice);
  expect(listener).toHaveBeenCalledOnce();
});
