import "server-only";

import OpenAI from "openai";

import {
  OpenAiConfigurationError,
  privacySafeIdentifier,
} from "@/ai/openai-responses-gateway";
import {
  buildRealtimeClientSecretRequest,
  isShortLivedRealtimeSecret,
  realtimeModelCandidates,
} from "@/voice/realtime-session";

export async function createRealtimeClientSecret(
  userId: string,
  apiKey = process.env.OPENAI_API_KEY,
) {
  if (!apiKey) throw new OpenAiConfigurationError();

  const client = new OpenAI({ apiKey });
  const models = realtimeModelCandidates(process.env.OPENAI_REALTIME_MODEL);
  let secret: Awaited<
    ReturnType<typeof client.realtime.clientSecrets.create>
  > | null = null;
  let selectedModel = models[0];
  let lastError: unknown;
  for (const model of models) {
    try {
      secret = await client.realtime.clientSecrets.create(
        buildRealtimeClientSecretRequest(model),
        {
          headers: {
            "OpenAI-Safety-Identifier": privacySafeIdentifier(userId),
          },
        },
      );
      selectedModel = model;
      break;
    } catch (error) {
      lastError = error;
      if ((error as { status?: unknown }).status !== 400) throw error;
    }
  }
  if (!secret) {
    try {
      secret = await client.realtime.clientSecrets.create(
        {},
        {
          headers: {
            "OpenAI-Safety-Identifier": privacySafeIdentifier(userId),
          },
        },
      );
      selectedModel = "provider-default";
    } catch (error) {
      throw error ?? lastError;
    }
  }
  if (!isShortLivedRealtimeSecret(secret.expires_at)) {
    throw new Error(
      "OpenAI returned a client secret outside the expiry bound.",
    );
  }

  return {
    value: secret.value,
    expiresAt: secret.expires_at,
    sessionId: secret.session.id,
    model:
      "model" in secret.session
        ? (secret.session.model ?? selectedModel)
        : selectedModel,
  };
}
