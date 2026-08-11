export const REALTIME_CLIENT_SECRET_TTL_SECONDS = 60;

export function buildRealtimeClientSecretRequest(model = "gpt-realtime-2.1") {
  return {
    expires_after: {
      anchor: "created_at" as const,
      seconds: REALTIME_CLIENT_SECRET_TTL_SECONDS,
    },
    session: {
      type: "realtime" as const,
      model,
      instructions:
        "You are the concise voice collaborator for a shared thinking canvas. " +
        "Discuss ideas but do not claim that you changed the canvas.",
      max_output_tokens: 256,
      audio: { output: { voice: "marin" as const } },
    },
  };
}
