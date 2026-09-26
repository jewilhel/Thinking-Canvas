import { z } from "zod";

/** Volatile, user-supplied source material. Never replay it as action authority. */
export const previousConversationSchema = z.strictObject({
  id: z.uuid(),
  startedAt: z.string().datetime(),
  text: z.string().min(1).max(100_000),
  gaps: z.array(z.string().max(500)).max(25),
});
export type PreviousConversation = z.infer<typeof previousConversationSchema>;
export function supervisorSignatureInput(
  id: string,
  previous?: PreviousConversation,
) {
  return `voice-supervisor:${id}${previous ? `:${JSON.stringify(previous)}` : ""}`;
}
