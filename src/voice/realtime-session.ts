export const REALTIME_CLIENT_SECRET_MAX_TTL_SECONDS = 10 * 60;
export const DEFAULT_REALTIME_MODELS = [
  "gpt-realtime-2.1",
  "gpt-realtime",
] as const;

export function realtimeModelCandidates(configuredModel?: string) {
  return configuredModel ? [configuredModel] : [...DEFAULT_REALTIME_MODELS];
}

export function buildRealtimeClientSecretRequest(model = "gpt-realtime-2.1") {
  return {
    session: {
      type: "realtime" as const,
      model,
      audio: { output: { voice: "marin" as const } },
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
