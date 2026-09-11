export const VOICE_DESCRIPTION_REQUEST =
  "Describe the current canvas briefly without making changes.";
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
