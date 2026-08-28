export const AI_RUN_DEADLINE_MS = 75_000;

export class AiRunTimeoutError extends Error {
  constructor() {
    super("The AI run exceeded its safe execution time.");
    this.name = "AiRunTimeoutError";
  }
}

export function throwIfAiRunAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new DOMException("The AI run was interrupted.", "AbortError");
}

export function createAiRunDeadlineSignal(
  parentSignal: AbortSignal,
  timeoutMs = AI_RUN_DEADLINE_MS,
) {
  const controller = new AbortController();
  const abortFromParent = () =>
    controller.abort(
      parentSignal.reason instanceof Error
        ? parentSignal.reason
        : new DOMException("The AI run was interrupted.", "AbortError"),
    );
  if (parentSignal.aborted) abortFromParent();
  else parentSignal.addEventListener("abort", abortFromParent, { once: true });
  const timeout = setTimeout(
    () => controller.abort(new AiRunTimeoutError()),
    timeoutMs,
  );
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timeout);
      parentSignal.removeEventListener("abort", abortFromParent);
    },
  };
}
