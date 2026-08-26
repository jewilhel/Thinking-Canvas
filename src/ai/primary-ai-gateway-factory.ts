import "server-only";

import { z } from "zod";

import { FakePrimaryAiGateway } from "@/ai/fake-collaborator-gateway";
import { OpenAiPrimaryAiGateway } from "@/ai/openai-primary-ai-gateway";
import { OpenAiConfigurationError } from "@/ai/openai-responses-gateway";
import type { PrimaryAiGateway } from "@/ai/primary-ai-gateway";

const providerEnvironmentSchema = z.object({
  THINKING_CANVAS_AI_GATEWAY: z.enum(["fake", "openai"]).default("fake"),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_BASE_URL: z.url().optional(),
  OPENAI_RESPONSES_MODEL: z
    .enum(["gpt-5.6-terra", "gpt-5.6-sol", "gpt-5.6-luna"])
    .default("gpt-5.6-luna"),
  OPENAI_RESPONSES_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(120_000)
    .default(45_000),
  OPENAI_RESPONSES_MAX_OUTPUT_TOKENS: z.coerce
    .number()
    .int()
    .min(256)
    .max(16_000)
    .default(4_000),
});

export type PrimaryAiProviderEnvironment = z.infer<
  typeof providerEnvironmentSchema
>;

export function parsePrimaryAiProviderEnvironment(
  environment: Record<string, string | undefined>,
) {
  return providerEnvironmentSchema.parse(environment);
}

export function createPrimaryAiGateway(
  environment: Record<string, string | undefined> = process.env,
): PrimaryAiGateway {
  const config = parsePrimaryAiProviderEnvironment(environment);
  if (config.THINKING_CANVAS_AI_GATEWAY === "fake") {
    return new FakePrimaryAiGateway();
  }
  if (!config.OPENAI_API_KEY) throw new OpenAiConfigurationError();
  return new OpenAiPrimaryAiGateway({
    apiKey: config.OPENAI_API_KEY,
    baseURL: config.OPENAI_BASE_URL,
    model: config.OPENAI_RESPONSES_MODEL,
    timeoutMs: config.OPENAI_RESPONSES_TIMEOUT_MS,
    maxOutputTokens: config.OPENAI_RESPONSES_MAX_OUTPUT_TOKENS,
  });
}
