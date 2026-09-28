import { z } from "zod";

export const voiceTaskFailureSchema = z.strictObject({
  sessionId: z.uuid(),
  id: z.string().min(1).max(512),
  reason: z.enum(["queue_full", "context_limit"]),
});
export type VoiceTaskFailure = z.infer<typeof voiceTaskFailureSchema>;

const listeners = new Set<
  (canvasId: string, notice: VoiceTaskFailure) => void
>();

/** Route validated ephemeral metadata through the existing canvas connection. */
export function receiveVoiceTaskFailure(canvasId: string, payload: unknown) {
  const notice = voiceTaskFailureSchema.safeParse(payload);
  if (!notice.success || notice.data.id.startsWith("control:ending")) return;
  for (const listener of listeners) listener(canvasId, notice.data);
}

export function subscribeVoiceTaskFailures(
  listener: (canvasId: string, notice: VoiceTaskFailure) => void,
) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const taskFailureMessage =
  "A canvas request did not finish. Earlier completed changes still stand. You can keep talking or retry the request.";
