import { z } from "zod";
/** Highest selected model rate: $64/M tokens. Cached/text tokens are overestimated. */
export const VOICE_IN_FLIGHT_CENTS = 150;
export function conservativeUsageCents(value: unknown): number | null {
  const usage = z
    .object({ total_tokens: z.number().int().nonnegative().max(1_000_000) })
    .safeParse(value);
  return usage.success
    ? Math.ceil((usage.data.total_tokens * 64) / 10_000)
    : null;
}
export function voiceBudgetAllowsResponse(reserved: number, charged: number) {
  return (
    Number.isFinite(reserved) &&
    Number.isFinite(charged) &&
    charged >= 0 &&
    reserved - charged >= VOICE_IN_FLIGHT_CENTS
  );
}
