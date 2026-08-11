import "server-only";

import OpenAI from "openai";

import {
  OpenAiConfigurationError,
  privacySafeIdentifier,
} from "@/ai/openai-responses-gateway";
import { buildRealtimeClientSecretRequest } from "@/voice/realtime-session";

const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-2.1";

export async function createRealtimeClientSecret(
  userId: string,
  apiKey = process.env.OPENAI_API_KEY,
) {
  if (!apiKey) throw new OpenAiConfigurationError();

  const client = new OpenAI({ apiKey });
  const secret = await client.realtime.clientSecrets.create(
    buildRealtimeClientSecretRequest(REALTIME_MODEL),
    {
      headers: {
        "OpenAI-Safety-Identifier": privacySafeIdentifier(userId),
      },
    },
  );

  return {
    value: secret.value,
    expiresAt: secret.expires_at,
    sessionId: secret.session.id,
    model:
      "model" in secret.session
        ? (secret.session.model ?? REALTIME_MODEL)
        : REALTIME_MODEL,
  };
}
