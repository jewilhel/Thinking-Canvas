import { z } from "zod";

export const liveCanvasRequestSchema = z.strictObject({
  kind: z.enum(["question", "comment"]),
  text: z.string().trim().min(1).max(2000),
});
export type LiveCanvasRequest = z.infer<typeof liveCanvasRequestSchema>;
export const VOICE_DESCRIPTION_REQUEST =
  "Describe the current canvas briefly without making changes.";
export const defaultLiveCanvasRequest: LiveCanvasRequest = {
  kind: "question",
  text: VOICE_DESCRIPTION_REQUEST,
};

/** Only explicit canvas questions or comment requests enter this slice. */
export function parseLiveCanvasRequest(text: string): LiveCanvasRequest | null {
  const request = text.trim();
  if (!request || request.length > 2000 || cancelsVoiceTask(request))
    return null;
  const prefix = "(?:please\\s+)?(?:(?:can|could|would) you\\s+)?";
  if (
    new RegExp(
      `^${prefix}(?:add|leave|write|create|post)\\s+(?:a\\s+)?comment\\b`,
      "i",
    ).test(request) &&
    !/\b(?:don't|do not|never|delete|remove|instead)\b/i.test(request)
  ) {
    return { kind: "comment", text: request };
  }
  if (
    recognizesCanvasDescription(request) ||
    (/^(?:(?:can|could|would) you\s+)?(?:tell me|describe|summarize|list|explain|what|which|where|how|why|are there|is there)\b/i.test(
      request,
    ) &&
      /\b(?:canvas|shapes?|objects?|documents?|connectors?|notes?|tables?|labels?|colors?|colours?|overlap)\b/i.test(
        request,
      ))
  ) {
    return { kind: "question", text: request };
  }
  return null;
}
/** Deliberately bounded M3 proof. Ambiguous requests require clarification. */
export function recognizesCanvasDescription(text: string) {
  if (/\b(?:not|never|don't|cancel|instead|actually)\b/i.test(text))
    return false;
  return /(?:^|[.!?]\s*)(?:please\s+)?(?:(?:can|could|would) you\s+)?(?:describe|summarize|list what(?:'s| is) on|tell me what(?:'s| is) on|what(?:'s| is) on)\s+(?:(?:the|my|this)\s+)?(?:current\s+)?canvas(?:\s+please)?[.!?\s]*$/i.test(
    text.trim(),
  );
}
export function cancelsVoiceTask(text: string) {
  return /\b(?:cancel (?:this|that|the) (?:task|request)|never mind|actually|instead)\b/i.test(
    text,
  );
}
// Standard uncached text prices per million tokens, verified 2026-09-11:
// https://developers.openai.com/api/docs/models (no long-context tier at this request bound).
export const VOICE_BACKEND_RATES = {
  "gpt-5.6-luna": { input: 20, output: 120 },
  "gpt-5.6-terra": { input: 200, output: 1200 },
  "gpt-5.6-sol": { input: 400, output: 2000 },
} as const;
export function voiceBackendUnits(
  model: keyof typeof VOICE_BACKEND_RATES,
  inputTokens: number,
  outputTokens: number,
) {
  if (
    ![inputTokens, outputTokens].every((n) => Number.isSafeInteger(n) && n >= 0)
  )
    return null;
  const rate = VOICE_BACKEND_RATES[model];
  return Math.ceil(
    ((inputTokens * rate.input + outputTokens * rate.output) * 12000) /
      1_000_000,
  );
}

export function controlRequestIsCurrent(
  requestedAt: string,
  cancelledAt: string | null,
) {
  const requested = Date.parse(requestedAt);
  return (
    Number.isFinite(requested) &&
    (!cancelledAt || requested > Date.parse(cancelledAt))
  );
}
