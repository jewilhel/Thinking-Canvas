export const REALTIME_CLIENT_SECRET_MAX_TTL_SECONDS = 10 * 60;

export function buildRealtimeClientSecretRequest(model = "gpt-realtime-2.1") {
  return {
    session: {
      type: "realtime" as const,
      model,
      audio: { output: { voice: "marin" as const } },
    },
  };
}

export function buildStoryNarrationClientSecretRequest(
  model = "gpt-realtime-2.1",
) {
  return {
    session: {
      type: "realtime" as const,
      model,
      output_modalities: ["audio" as const],
      audio: { output: { voice: "marin" as const } },
      instructions:
        "Read the supplied scene narration verbatim. Do not add, remove, summarize, or answer it.",
    },
  };
}

export function isShortLivedRealtimeSecret(
  expiresAt: number,
  nowInSeconds = Math.floor(Date.now() / 1_000),
) {
  return (
    expiresAt > nowInSeconds &&
    expiresAt <= nowInSeconds + REALTIME_CLIENT_SECRET_MAX_TTL_SECONDS + 5
  );
}
